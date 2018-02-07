module.exports = {
  priority: 10,
  process: container => {
    const { settings, msg, commands, client, _overwrite } = container
    const { prefix } = settings
    const defPrefix = `<@!${client.user.id}> `

    if (!_overwrite) {
      const chk = msg.content.startsWith(prefix)
      const rawArgs = msg.content.substring((chk ? prefix : defPrefix).length).split(' ')
      container.trigger = rawArgs[0].toLowerCase()
      container.isCommand = commands.has(container.trigger)
      container.rawArgs = rawArgs.slice(1).filter(v => !!v)
    } else {
      container.trigger = _overwrite.trigger
      container.isCommand = true
      container.rawArgs = _overwrite.rawArgs
    }

    return Promise.resolve(container)
  }
}
