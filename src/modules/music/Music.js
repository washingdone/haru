const logger = require('winston')
const crypto = require('crypto')
const moment = require('moment')
const url = require('url')
const querystring = require('querystring')
const request = require('superagent')
const ytdl = Promise.promisifyAll(require('ytdl-core'))
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs')

const { Module, Collection } = require('../../core')

class Music extends Module {
  constructor (...args) {
    super(...args, {
      name: 'music',
      events: {
        voiceChannelLeave: 'voiceDC',
        messageCreate: 'onMessage'
      }
    })

    this.redis = this.bot.engine.cache.client

    this.streams = {
      'listen.moe': {
        socket: 'https://listen.moe/api/v2/socket',
        url: 'http://listen.moe:9999/stream'
      }
    }
  }

  init () {
    this.player = this.bot.engine.modules.get('music:player')
    this.queue = this.bot.engine.modules.get('music:queue')

    this.states = new Collection()

    this._validator = setInterval(() => {
      for (const gid of this.states.keys()) {
        if (!this.bot.guilds.has(gid)) {
          this.states.delete(gid)
        }
      }
    }, 120000)

    this.connectWS()
  }

  connectWS () {
    this._ws = {}
    this.streamInfo = {}
    this._maxReconnects = 10
    for (const streamName in this.streams) {
      const stream = this.streams[streamName]
      let ws = this._ws[streamName] = new WebSocket(stream.socket)
      ws.on('message', data => {
        try {
          if (data) {
            const info = JSON.parse(data)
            this.streamInfo[stream.url] = (s => {
              switch (s) {
                case 'listen.moe': return {
                  title: info.song_name,
                  artist: info.artist_name,
                  requestedBy: info.requested_by
                }
                default: return
              }
            })(streamName)
          }
        } catch (err) {
          logger.error(`Error parsing ${stream.socket} message - ${err}`)
        }
      })
      ws.on('error', err => {
        if (err) {
          logger.error(`Error occurred with ${stream.socket} - ${err}`)
        }
      })
      this._connects = 0
      ws.on('close', () => {
        if (this._connects >= this._maxReconnects) return
        logger.error(`Reopening closed ${stream.socket} socket`)
        this._connects++
        setTimeout(this.connectWS, 2500)
      })
    }
  }

  unload () {
    for (const [guildID, state] of this.states.entries()) {
      let conn = this.bot.voiceConnections.get(guildID)
      if (!conn) continue
      conn.removeAllListeners()
      if (conn.playing) conn.stopPlaying()
      conn.disconnect()
      if (state.channel) {
        this.send(state.channel, ':info:  |  {{terminated}}')
      }
    }

    clearInterval(this._validator)
    delete this._validator

    for (const ws in this._ws) {
      this._ws[ws].removeAllListeners()
    }
    delete this.streamInfo
    delete this._ws
  }

  bindChannel (guildID, textChannelID) {
    this.states.set(guildID, {
      channel: textChannelID,
      state: null,
      skip: [],
      clear: [],
      shuffle: [],
      volume: 2
    })
  }

  unbindChannel (guildID) {
    this.states.delete(guildID)
  }

  getState (guildID) {
    return this.states.get(guildID)
  }

  checkState (guildID) {
    let state = this.getState(guildID)
    return state ? state.state : null
  }

  modifyState (guildID, stateName, value) {
    let state = this.states.get(guildID)
    if (typeof state !== 'object') return
    state[stateName] = value
    this.states.set(guildID, state)
  }

  getBoundChannel (guildID) {
    const connection = this.states.get(guildID)
    return connection ? connection.channel : null
  }

  getConnection (channel) {
    if (!channel || !channel.guild) return null
    return this.bot.voiceConnections.get(channel.guild.id) || null
  }

  getPlaying (guildID) {
    let state = this.checkState(guildID)
    return state
    ? typeof state === 'string'
    ? this.streamInfo[state] || null
    : state
    : null
  }

  async connect (voiceID, textChannel) {
    if (!voiceID || !textChannel || !textChannel.guild) {
      return Promise.reject('notInVoice')
    }
    const guild = textChannel.guild
    let channel = this.getBoundChannel(guild)
    if (channel && channel !== textChannel.id) {
      return Promise.reject('alreadyBinded')
    }
    this.bindChannel(guild.id, textChannel.id)
    if (!this.hasPermissions(textChannel, this.bot.user, 'voiceConnect', 'voiceSpeak')) {
      return Promise.reject('noPerms')
    }
    try {
      return await this.bot.joinVoiceChannel(voiceID)
    } catch (err) {
      logger.error(`Could not join voice channel ${voiceID} in ${guild.name} (${guild.id}) - ${err}`)
      return Promise.reject('error')
    }
  }

  getFormatUrl (type, formats) {
    const bestaudio = formats.sort((a, b) => b.audioBitrate - a.audioBitrate)
    .find(f => f.audioBitrate > 0 && !f.bitrate) || formats.find(f => f.audioBitrate > 0)

    if (!bestaudio.url) return
    bestaudio._format = type
    return bestaudio
  }

  downloadURL (vidUrl, file) {
    const filepath = path.join(this.bot.paths.resources, 'audio', file)
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(filepath)
      stream.on('finish', () => {
        stream.close()
        resolve(filepath)
      }).on('error', err => {
        fs.unlink(filepath)
        reject(err)
      })
      request.get(vidUrl).pipe(stream)
    })
  }

  hash (str) {
    return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
  }

  getFile (format, url) {
    const hash = this.hash(url) + (format === 'webm' ? '.webm' : '.flv')
    const filepath = path.join(this.bot.paths.resources, 'audio', hash)
    return fs.existsSync(filepath) ? filepath : null
  }

  getBestAudio (mediaInfo) {
    let formats = mediaInfo.formats.filter(f => [249, 250, 251].includes(parseInt(f.itag)))
    if (formats && formats.length) {
      return this.getFormatUrl('webm', formats)
    }
    formats = mediaInfo.formats.filter(f => [141, 140, 139].includes(parseInt(f.itag)))
    if (!formats || !formats.length) {
      formats = mediaInfo.formats.filter(f => f.container === 'mp4')
    }
    if (formats && formats.length) return this.getFormatUrl('mp4', formats)
  }

  async getInfo (url, fetchAll = false) {
    const key = `music:info:${this.hash(url)}`
    let info = await this.redis.getAsync(key).catch(() => false)
    if (info) return JSON.parse(info)

    info = await ytdl.getInfoAsync(url)

    if (!info || !info.video_id) return Promise.reject('noVideoFound')
    info.url = `https://www.youtube.com/watch?v=${info.video_id}`

    const bestaudio = this.getBestAudio(info)
    const formattedInfo = {
      video_id: info.video_id,
      title: info.title,
      thumbnail_url: info.thumbnail_url,
      url: info.url,
      audiourl: bestaudio.url,
      audioformat: bestaudio._format,
      audiotype: bestaudio.itag,
      length: parseInt(info.length_seconds)
    }

    info = fetchAll ? info : formattedInfo
    // this.redis.setex(key, 18000, JSON.stringify(formattedInfo))
    await this.downloadURL(
      formattedInfo.audiourl,
      this.hash(info.url) + (formattedInfo.audioformat === 'webm' ? '.webm' : '.flv')
    ).catch(err => {
      logger.error(err)
      return false
    })
    return info
  }

  async queueSong (guildId, voiceChannel, mediaInfo) {
    if (!this.getPlayingState(voiceChannel)) {
      if (mediaInfo.audiourl) {
        await this.player.play(voiceChannel, mediaInfo)
        return mediaInfo
      }
      await this.play(voiceChannel)
      return mediaInfo
    }
    await this.queue.add(guildId, mediaInfo)
    return mediaInfo
  }

  getPlayingState (channel) {
    if (!channel || !channel.guild) return false
    const conn = this.bot.voiceConnections.get(channel.guild.id)
    if (!conn) return false
    return conn.playing
  }

  async add (guildId, voiceChannel, url) {
    if (typeof url === 'object') url = url.url
    if (typeof url !== 'string') return Promise.reject('invalidURL')
    url = url.replace('/<|>/g', '')
    let mediaInfo = await this.getInfo(url)
    if (mediaInfo && mediaInfo.length && mediaInfo.length > 5400) {
      return Promise.reject('tooLong')
    }
    return this.queueSong(guildId, voiceChannel, mediaInfo)
  }

  voiceDC (member, channel) {
    if (!channel.voiceMembers.has(this.bot.user.id)) return
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(this.bot.user.id)) {
      const textChannel = this.getBoundChannel(channel.guild.id)
      this.send(textChannel, ':headphones:  |  {{dcInactive}}')
      return this.player.stop(channel, true)
    }
  }

  async play (channel, mediaInfo) {
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(this.bot.user.id)) {
      return this.player.stop(channel, true)
    }
    const guildId = channel.guild.id
    const textChannel = this.getBoundChannel(guildId)

    if (!textChannel) return Promise.reject('notInChannel')
    const state = this.getState(guildId) || 2
    const volume = state ? state.volume : 2
    if (mediaInfo) {
      return this.player.play(channel, mediaInfo, volume)
    }

    if (!await this.queue.getLength(guildId)) {
      this.send(textChannel, ':info:  |  {{queueFinish}}')
      return this.player.stop(channel)
    }

    const item = await this.queue.shift(guildId)
    const url = mediaInfo ? mediaInfo.url || item.url : item.url

    try {
      mediaInfo = await this.getInfo(url)
    } catch (err) {
      return Promise.reject(err)
    }
    if (!mediaInfo) {
      return this.play(channel)
    }

    return this.player.play(channel, mediaInfo, volume)
  }

  setVolume (guild, volume) {
    this.modifyState(guild.id, 'volume', (parseInt(volume, 10) * 2) / 100)
  }

  async skip (guildId, voiceChannel, authorId, force = false) {
    if (!force && voiceChannel.voiceMembers.size > 2) {
      const state = this.getState(guildId)
      let vote = state.skip || []
      if (vote.includes(authorId)) {
        return Promise.resolve('votedSkip')
      }

      vote.push(authorId)

      if ((vote.length / voiceChannel.voiceMembers.filter(m => !m.voiceState.selfDeaf && !m.voiceState.deaf).length) < 0.4) {
        this.modifyState(guildId, 'skip', vote)
        return Promise.resolve('voteSkipSuccess')
      } else {
        this.modifyState(guildId, 'skip', [])
      }
    }

    return this.player.skip(guildId, voiceChannel)
  }

  async clear (guildId, voiceChannel, authorId, force = false) {
    if (!force && voiceChannel.voiceMembers.size > 2) {
      const state = this.getState(guildId)
      let vote = state.clear || []
      if (vote.includes(authorId)) {
        return Promise.resolve('votedClear')
      }

      vote.push(authorId)

      if ((vote.length / voiceChannel.voiceMembers.filter(m => !m.voiceState.selfDeaf && !m.voiceState.deaf).length - 1) < 0.4) {
        this.modifyState(guildId, 'clear', vote)
        return Promise.resolve('voteClearSuccess')
      } else {
        this.modifyState(guildId, 'clear', [])
      }
    }

    const textChannel = this.getBoundChannel(guildId)
    try {
      await this.queue.clear(guildId)
      return this.send(textChannel, ':success:  |  {{clearQueue}}')
    } catch (err) {
      logger.error(`Could not clear queue for ${guildId}`)
      logger.error(err)

      return this.send(textChannel, ':error:  |  {{%ERROR_FULL}}')
    }
  }

  async validate (videoID) {
    try {
      const res = await request.head(
        `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${escape(videoID)}&format=json`
      )
      return res.statusCode === 404 || res.statusMessage === 'Not Found'
      ? res.error ? Promise.reject('error') : Promise.reject('notFound')
      : videoID
    } catch (err) {
      logger.error(`Error encountered while validating video ${videoID} -`, err)
      return Promise.reject(err)
    }
  }

  async fetchPlaylist (pid) {
    const res = await request.get(
      'https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50' +
      `&playlistId=${pid}&key=${process.env.API_YT}` 
    )
    return res.statusCode === 404 || res.statusMessage === 'Not Found'
    ? res.error ? Promise.reject('error') : Promise.reject('notFound')
    : res.body
  }

  async getPlaylist (pid) {
    const key = `music:playlist:${this.hash(pid)}`
    let info = await this.redis.getAsync(key).catch(() => false)
    if (info) return JSON.parse(info)

    try {
      const playlist = await this.fetchPlaylist(pid)
      if (!playlist.items.length) return Promise.reject('emptyPlaylist')
      const playlistInfo = {
        id: playlist.etag.substring(1, playlist.etag.length - 1),
        results: playlist.pageInfo.totalResults,
        items: playlist.items.map(i => i.contentDetails.videoId)
      }
      this.redis.setex(key, 21600, JSON.stringify(playlistInfo))
      return playlistInfo
    } catch (err) {
      if (err instanceof Error) {
        logger.error(`Error encountered while querying playlist ${pid} -`, err)
      }
      throw err
    }
  }

  onMessage (msg) {
    if (!msg.guild) return

    const text = this.getBoundChannel(msg.guild)
    if (!text || text !== msg.channel.id) return

    if (!this.getConnection(msg.channel)) return
    if (!this.isLink(msg.content)) return

    return this.checkLink(msg.content, msg)
  }

  isLink (text) {
    const yt = url.parse(text).host
    return yt && (yt.endsWith('youtube.com') || yt.endsWith('youtu.be'))
  }

  parseLink (text) {
    if (!this.isLink(text)) return false
    const yt = url.parse(text)
    const query = querystring.parse(yt.query)
    return { v: (yt.host.endsWith('youtu.be') ? yt.path.replace('/', '') : query.v) || null, pid: query.list || null }
  }

  queueMulti (items, msg, voiceChannel, prefix) {
    return new Promise((resolve, reject) => {
      let first
      const loop = (i = 0) => {
        const item = items[i++]
        if (i >= items.length) {
          return resolve(first)
        }
        return this.add(msg.guild.id, voiceChannel, `https://www.youtube.com/watch?v=${item}`)
        .then(() => {
          if (!first) first = item
          return loop(i)
        })
        .catch(err => {
          this.send(
            msg.channel,
            `:error:  |  **${msg.author.username}**, ${
              err instanceof Error
              ? `{{errors.errorQueue}}\n\n${err.message}`
              : `{{errors.${err}}}`
            }`,
            {
              url: `<https://www.youtube.com/watch?v=${item}>`,
              command: `**\`${prefix}summon\`**`
            }
          )
          return loop(i)
        })
      }
      return loop()
    })
  }

  async checkLink (text, msg) {
    const conn = this.getConnection(msg.channel)
    const voiceChannel = this.bot.getChannel(conn.channelID)
    const query = this.parseLink(text)
    const settings = await this.bot.engine.db.data.Guild.fetch(msg.guild.id)
    try {
      if (query.pid) {
        const m = await this.send(msg.channel, `:hourglass:  |  **${msg.author.username}**, {{queueProgress}}`)
        const playlist = await this.getPlaylist(query.pid)

        const firstVideo = await this.queueMulti(playlist.items, msg, voiceChannel, settings.prefix)
        if (!firstVideo) {
          return this.edit(m, `:error:  |  **${msg.author.username}**, {{errors.emptyPlaylist}}`)
        }

        await this.edit(m, `:success:  |  {{queuedMulti}} - **${msg.author.mention}**`, {
          num: playlist.results > 50 ? 50 : playlist.results - 1
        })
        return this.deleteMessages(msg)
      } else if (query.v) {
        const videoID = await this.validate(query.v)
        const info = await this.add(msg.guild.id, voiceChannel, `https://www.youtube.com/watch?v=${videoID}`)
        const length = info.length ? `(${moment.duration(info.length, 'seconds').format('h[h] m[m] s[s]')}) ` : ''

        await this.send(msg.channel, `:success:  |  {{queued}} **${info.title}** ${length}- **${msg.author.mention}**`)
        return this.deleteMessages(msg)
      }
    } catch (err) {
      if (err instanceof Error) {
        logger.error(`Error adding ${query.v ? 'song ' + query.v : 'playlist ' + query.pid} to ${msg.guild.name} (${msg.guild.id})'s queue`)
        logger.error(err)
        return this.send(msg.channel, `:error:  |  **${msg.author.username}**, {{%ERROR}}\n\n${err}`)
      }
      return this.send(msg.channel, `:error:  |  **${msg.author.username}**, {{errors.${err}}}`, { command: `**\`${settings.prefix}summon\`**` })
    }
  }
}

module.exports = Music
