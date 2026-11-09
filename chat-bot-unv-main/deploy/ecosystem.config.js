// pm2 start deploy/ecosystem.config.js   — یک پروسه برای هر هسته
module.exports = { apps: [{
  name: 'chatbot', script: 'server.js', cwd: __dirname + '/..',
  exec_mode: 'cluster', instances: 'max', max_memory_restart: '400M',
}] };
