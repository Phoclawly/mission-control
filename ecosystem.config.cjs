module.exports = {
  apps: [
    {
      name: 'mission-control',
      script: 'node_modules/.bin/next',
      args: 'start -p 4040 -H 0.0.0.0',
      cwd: '/home/node/.openclaw/repos/mission-control',
      env: {
        NODE_ENV: 'production',
        PORT: '4040',
        HOSTNAME: '0.0.0.0',
        // Force load .env.local
        DOTENV_CONFIG_PATH: '/home/node/.openclaw/repos/mission-control/.env.local'
      },
      // PM2 settings
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      max_memory_restart: '512M',
      // Logging
      out_file: '/home/node/.openclaw/logs/mission-control-out.log',
      error_file: '/home/node/.openclaw/logs/mission-control-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'mc-sync-daemon',
      script: 'scripts/sync-daemon.js',
      cwd: '/home/node/.openclaw/repos/mission-control',
      // Daemon settings
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 10000,
      watch: false,
      max_memory_restart: '64M',
      // Logging
      out_file: '/home/node/.openclaw/logs/mc-sync-daemon-out.log',
      error_file: '/home/node/.openclaw/logs/mc-sync-daemon-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
