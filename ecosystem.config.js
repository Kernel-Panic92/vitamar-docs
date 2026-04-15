// ecosystem.config.js  —  PM2 process config
module.exports = {
  apps: [
    {
      name:         'vitamar-docs',
      script:       './src/server.js',
      instances:    1,
      autorestart:  true,
      watch:        false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:  './logs/error.log',
      out_file:    './logs/out.log',
      merge_logs:  true,
    },
  ],
};
