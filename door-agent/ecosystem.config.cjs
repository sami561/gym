// pm2 process file: `npm run build && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`
module.exports = {
  apps: [
    {
      name: 'meliora-door-agent',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      max_memory_restart: '200M',
      kill_timeout: 6000,
      env: {
        NODE_ENV: 'production',
        TZ: 'Africa/Tunis',
        SCAN_STDIN: 'false',
        LOG_FORMAT: 'json',
      },
    },
  ],
};
