const { Command, utils } = require('sylphy')

class Companions extends Command {
  constructor (...args) {
    super(...args, {
      name: 'companion',
      description: 'Animal companion system',
      usage: [{ name: 'action', displayName: 'buy | rename | peek | feed | sell | top', type: 'string', optional: true }],
      aliases: ['pet'],
      cooldown: 5,
      subcommands: {
        buy: 'buy',
        peek: {
          usage: [{ name: 'user', type: 'member', optional: false }],
          options: { guildOnly: true }
        },
        rename: 'rename',
        feed: {
          usage: [{ name: 'amount', type: 'int', optional: true }]
        },
        sell: 'sell',
        top: 'top'
      },
      options: { botPerms: ['embedLinks'] },
      group: 'games'
    })
  }

  /*
  ██   ██  █████  ███    ██ ██████  ██      ███████
  ██   ██ ██   ██ ████   ██ ██   ██ ██      ██
  ███████ ███████ ██ ██  ██ ██   ██ ██      █████
  ██   ██ ██   ██ ██  ██ ██ ██   ██ ██      ██
  ██   ██ ██   ██ ██   ████ ██████  ███████ ███████
  */
  async handle ({ msg, plugins, settings, trigger }, responder) {
    const User = plugins.get('db').data.User
    const companion = (await User.fetch(msg.author.id)).companion
    if (!companion) {
      responder.error('{{noPet}}', { command: `**\`${settings.prefix}${trigger} buy\`**` })
      return
    }
    const stats = companion.stats || {}
    responder.embed({
      color: utils.getColour('blue'),
      author: { name: responder.t('{{definitions.info}}'), icon_url: msg.author.avatarURL },
      description: `**\`LVL ${companion.level || 0}\`** :${companion.type}:  ${companion.name}`,
      fields: [
        { name: responder.t('{{definitions.wins}}'), value: stats.wins || 0, inline: true },
        { name: responder.t('{{definitions.losses}}'), value: stats.losses || 0, inline: true },
        // INSERT LINEBREAK HERE !!!!!!!!!!!!!!!!!!!!!
        { name: responder.t('{{definitions.hp}}'), value: (companion.hp).toString() || 0, inline: true },
        { name: responder.t('{{definitions.atk}}'), value: (companion.atk).toString() || 0, inline: true },
        { name: responder.t('{{definitions.crit}}'), value: (companion.crit / 100).toString() || 0, inline: true },
        { name: responder.t('{{definitions.heal}}'), value: (companion.heal / 100).toString() || 0, inline: true },
        { name: responder.t('{{definitions.mood}}'), value: companion.mood || 10, inline: true},
        { name: responder.t('{{definitions.hunger}}'), value: companion.hunger || 10, inline: true}
      ]
    }).send()
  }

  /*
  ███████ ███████ ███████ ██████
  ██      ██      ██      ██   ██
  █████   █████   █████   ██   ██
  ██      ██      ██      ██   ██
  ██      ███████ ███████ ██████
  */
  async feed ({ msg, plugins, args }, responder) {
    const User = plugins.get('db').data.User
    const user = await User.fetch(msg.author.id)
    const companion = (await User.fetch(msg.author.id)).companion
    if (!companion) {
      responder.error('{{noPet}}', { command: `**\`${settings.prefix}${trigger} buy\`**` })
      return
    }
    const amount = args.amount || 1
    if ((companion.hunger + amount) > 10) {
      responder.error('{{tooHungry}}', {amount: `**${amount}**`})
      return
    }
    if (user.petfood < amount) {
      responder.error('{{notEnoughFood}}', {
        amount: `**${amount}**`,
        inv: `**${user.petfood}**`,
        animal: `:${companion.type}:`
      })
      return
    }
    if ((companion.mood + amount) > 10) {
      companion.mood = 10
    } else {
      companion.mood += amount
    }
    companion.hunger += amount
    user.petfood -= amount
    try {
      await user.saveAll()
      await User.update(user.id, user)
    } catch (err) {
      this.logger.error(`Could not save after companion feeding: ${err}`)
      return responder.error('{{error}}')
    }
    responder.format('emoji:success').send('{{petFed}}', {
      author: `**${msg.author.username}**`,
      animal: `:${companion.type}:`,
      amount: `**${amount}**`
    })
  }

  /*
  ██████  ███████ ███████ ██   ██
  ██   ██ ██      ██      ██  ██
  ██████  █████   █████   █████
  ██      ██      ██      ██  ██
  ██      ███████ ███████ ██   ██
  */
  async peek ({ args, plugins }, responder) {
    const User = plugins.get('db').data.User
    const [member] = await responder.selection(args.user, { mapFunc: m => `${m.user.username}#${m.user.discriminator}` })
    if (!member) return
    const companion = (await User.fetch(member.user.id)).companion
    if (!companion) {
      responder.error('{{errors.opponentNoCompanion}}')
      return
    }
    const stats = companion.stats || {}
    responder.embed({
      color: utils.getColour('blue'),
      author: { name: responder.t('{{definitions.info}}'), icon_url: member.user.avatarURL },
      description: `**\`LVL ${companion.level || 0}\`** :${companion.type}:  ${companion.name}`,
      fields: [
        { name: responder.t('{{definitions.wins}}'), value: stats.wins || 0, inline: true },
        { name: responder.t('{{definitions.losses}}\n'), value: stats.losses || 0, inline: true },
        // INSERT LINEBREAK HERE !!!!!!!!!!!!!!!!!!!!!
        { name: responder.t('{{definitions.hp}}'), value: (companion.hp).toString() || 0, inline: true },
        { name: responder.t('{{definitions.atk}}'), value: (companion.atk).toString() || 0, inline: true },
        { name: responder.t('{{definitions.crit}}'), value: (companion.crit / 100).toString() || 0, inline: true },
        { name: responder.t('{{definitions.heal}}'), value: (companion.heal / 100).toString() || 0, inline: true },
        { name: responder.t('{{definitions.mood}}'), value: companion.mood || 10, inline: true},
        { name: responder.t('{{definitions.hunger}}'), value: companion.hunger || 10, inline: true}
      ]
    }).send()
  }

  /*
  ██████  ███████ ███    ██  █████  ███    ███ ███████
  ██   ██ ██      ████   ██ ██   ██ ████  ████ ██
  ██████  █████   ██ ██  ██ ███████ ██ ████ ██ █████
  ██   ██ ██      ██  ██ ██ ██   ██ ██  ██  ██ ██
  ██   ██ ███████ ██   ████ ██   ██ ██      ██ ███████
  */
  async rename ({ msg, settings, plugins, modules }, responder) {
    const User = plugins.get('db').data.User
    const companions = modules.get('companions')
    if (!companions) return this.logger.error('Companions module not found')
    const user = await User.fetch(msg.author.id)
    if (!user.companion) {
      responder.error('{{noPet}}', { command: `**\`${settings.prefix}companion buy\`**` })
      return
    }
    const arg = await responder.format('emoji:pencil2').dialog([{
      prompt: '{{renameDialog}}',
      input: { type: 'string', name: 'newName', max: 100 }
    }], {
      pet: `:${user.companion.type}: "**${user.companion.name}**"`,
      user: `**${msg.author.username}**`
    })

    user.companion.name = arg.newName
    try {
      await user.saveAll({ companion: true })
    } catch (err) {
      this.logger.error(`Could not save after companion rename: ${err}`)
      return responder.error('{{error}}')
    }
    responder.success('{{renameSuccess}}', {
      pet: `:${user.companion.type}:`,
      newName: `"**${arg.newName}**"`
    })
  }

  /*
  ██████  ██    ██ ██    ██
  ██   ██ ██    ██  ██  ██
  ██████  ██    ██   ████
  ██   ██ ██    ██    ██
  ██████   ██████     ██
  */
  async buy ({ msg, settings, plugins, modules }, responder) {
    const db = plugins.get('db')
    const companions = modules.get('companions')
    if (!companions) return this.logger.error('Companions module not found')
    const user = await db.data.User.fetch(msg.author.id)
    if (user.companion) {
      responder.error('{{ownedPet}}')
      return
    }
    if (user.credits < companions.prices[0]) {
      responder.error('{{cannotAfford}}', {
        amount: `**${companions.prices[0]}**`,
        balance: `**${user.credits}**`
      })
      return
    }

    const pets = Object.keys(companions.pets[0])
    const reactions = modules.get('reactions')
    if (!reactions) return
    const input = this.resolver

    const message = await responder.format('emoji:info').send([
      '**{{intro}}**',
      '```markdown',
      pets.map((c, i) => `${utils.padEnd(`[${i + 1}]:`, 4)} :${c}:`).join('\n'),
      '> {{%menus.INPUT}}',
      '```'
    ], { user: msg.author.username, cancel: 'cancel' })
    const collector = plugins.get('middleware').collect({
      channel: msg.channel.id,
      author: msg.author.id,
      time: 30
    })
    const awaitMessage = async (msg) => {
      try {
        var ans = await collector.next()
        if (ans.content.toLowerCase() === 'cancel') return Promise.resolve()
        try {
          return await input.resolve(ans, [ans.cleanContent], {}, {
            type: 'int', name: 'reply', min: 1, max: pets.length
          })
        } catch (err) {
          const re = await responder.format('emoji:error').send(
            `${`{{%errors.${err.err}}}` || '{{%menus.ERROR}}'}\n\n{{%menus.EXIT}}`,
            Object.assign(err, { cancel: '`cancel`' })
          )
          return awaitMessage(re)
        }
      } catch (err) {
        return Promise.reject(err)
      } finally {
        this.deleteMessages(msg, ans)
      }
    }

    try {
      var choice = await Promise.race([
        awaitMessage(message),
        reactions.addMenu(message, msg.author.id, pets)
      ])
    } catch (err) {
      if (typeof err !== 'undefined') {
        if (!err.reason) return responder.error()
        return responder.error(`{{%menus.ERRORED}} **{{%collector.${err.reason}}}**`, {
          [err.reason]: err.arg, err: `**${err.reason}**`
        })
      } else {
        return responder.success('{{%menus.EXITED}}')
      }
    } finally {
      collector.stop()
      reactions.menus.delete(message.id)
    }

    if (!choice) return responder.success('{{%menus.EXITED}}')
    choice = choice.reply ? pets[choice.reply - 1] : choice

    const code = ~~(Math.random() * 8999) + 1000
    const arg = await responder.format('emoji:info').dialog([{
      prompt: '{{dialog}}',
      input: { type: 'string', name: 'code' }
    }], {
      author: `**${msg.author.username}**`,
      animal: `:${choice}:`,
      amount: `**${companions.prices[0]}**`,
      code: `**\`${code}\`**`
    })
    if (parseInt(arg.code, 10) !== code) {
      return responder.error('{{invalidCode}}')
    }
    user.credits -= companions.prices[0]
    const companion = new db.models.Companion({
      id: msg.author.id,
      name: responder.t('{{definitions.info2}}', {
        author: msg.author.username
      }),
      type: choice
    })
    user.companion = companion

    try {
      await user.saveAll({ companion: true })
    } catch (err) {
      this.logger.error(`Could not save after companion purchase`, err)
      return responder.error('{{error}}')
    }
    responder.format('emoji:success').send('{{result}}', {
      author: `**${msg.author.username}**`,
      animal: `:${choice}:`,
      balance: `:credit_card: **${user.credits}**`,
      command: `**\`${settings.prefix}companion rename\`**`
    })
  }

  /*
  ███████ ███████ ██      ██
  ██      ██      ██      ██
  ███████ █████   ██      ██
       ██ ██      ██      ██
  ███████ ███████ ███████ ███████
  */
  async sell ({ msg, settings, plugins, modules }, responder) {
    const User = plugins.get('db').data.User
    const companions = modules.get('companions')
    if (!companions) return this.logger.error('Companions module not found')
    const user = await User.fetch(msg.author.id)
    if (!user.companion) {
      responder.error('{{noPet}}', { command: `**\`${settings.prefix}companion buy\`**` })
      return
    }
    const code = ~~(Math.random() * 8999) + 1000
    const argCode = await responder.format('emoji:info').dialog([{
      prompt: '{{sold.dialog}}',
      input: { type: 'string', name: 'code' }
    }], {
      code: `**\`${code}\`**`
    })
    if (parseInt(argCode.code, 10) !== code) {
      return responder.error('{{invalidCode}}')
    }

    try {
      delete user.companion
      await user.save()
    } catch (err) {
      this.logger.error(`Could not save after companion removal`, err)
      return responder.error('{{error}}')
    }
    responder.format('emoji:success').send('{{sold.result}}', {
      author: `**${msg.author.username}**`
    })
  }

  /*
  ████████  ██████  ██████
     ██    ██    ██ ██   ██
     ██    ██    ██ ██████
     ██    ██    ██ ██
     ██     ██████  ██
  */
  async top ({ args, plugins }, responder) {
    const db = plugins.get('db').models
    try {
      const res = await db.User.filter({ deleted: false, excluded: false, companion: { atk: 1 } }).orderBy(db.r.desc(db.r.row('companion')('exp'))).limit(10).execute()
      const data = await plugins.get('ipc').awaitResponse('query', {
        queries: [{ prop: 'users', query: 'id', input: res.map(u => u.id) }]
      })
      const users = data.map(d => d[0])
      let unique = []
      for (let i = 0; i < users[0].length; i++) {
        if (users[0][i]) unique.push(users[0][i])
        else {
          let idx = 1
          let usr
          while (idx < data.length) {
            usr = users[idx++][i]
            if (usr) break
          }
          unique.push(usr)
        }
      }
      unique = unique.filter(u => u)
      let maxName = 16
      unique.forEach(u => {
        const str = `${u.username}#${u.discriminator}`
        maxName = str.length + 6 > maxName ? str.length + 6 : maxName
      })
      let maxCred = 4
      res.forEach(r => {
        r = r.companion.exp
        maxCred = String(r).length > maxCred ? String(r).length + 1 : maxCred
      })

      return responder.send([
        '```py',
        `@ ${responder.t('{{topTitle}}')}\n`,
        unique.map((u, i) => (
          utils.padEnd(`[${i + 1}]`, 5) +
          ` ${utils.padEnd(`${u.username}#${u.discriminator}`, maxName)} >>   ` +
          `${utils.padStart(res[i].companion.exp, maxCred)} ${responder.t('{{exp}}')}`
        )).join('\n'),
        '```'
      ].join('\n'))
    } catch (err) {
      this.logger.error('Error getting top credits scoreboards', err)
      return responder.error()
    }
  }

}

/*
███████ ██    ██ ██████   ██████  ██████  ███    ███ ███    ███  █████  ███    ██ ██████  ███████
██      ██    ██ ██   ██ ██      ██    ██ ████  ████ ████  ████ ██   ██ ████   ██ ██   ██ ██
███████ ██    ██ ██████  ██      ██    ██ ██ ████ ██ ██ ████ ██ ███████ ██ ██  ██ ██   ██ ███████
     ██ ██    ██ ██   ██ ██      ██    ██ ██  ██  ██ ██  ██  ██ ██   ██ ██  ██ ██ ██   ██      ██
███████  ██████  ██████   ██████  ██████  ██      ██ ██      ██ ██   ██ ██   ████ ██████  ███████
*/
class PetBuy extends Companions {
  constructor (...args) {
    super(...args, {
      name: 'buypet',
      description: 'Purchases your personal companion',
      options: { localeKey: 'companion' },
      aliases: [],
      usage: [],
      subcommand: 'buy'
    })
  }
}

class PetFeed extends Companions {
  constructor (...args) {
    super(...args, {
      name: 'feedpet',
      description: 'Feeds your personal companion',
      options: { localeKey: 'companion' },
      aliases: [],
      usage: [{ name: 'amount', type: 'int', optional: true }],
      subcommand: 'feed'
    })
  }
}

class PetSell extends Companions {
  constructor (...args) {
    super(...args, {
      name: 'sellpet',
      description: 'Sells your personal companion',
      options: { localeKey: 'companion' },
      aliases: [],
      usage: [],
      subcommand: 'sell'
    })
  }
}

module.exports = [ Companions, PetBuy, PetFeed, PetSell ]
