module.exports = {
    apps: [
        {
            name: 'outbreak-bot',
            script: 'src/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',

            // Logging
            out_file: './logs/out.log',
            error_file: './logs/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,

            // Environment variables are set in JPaaS dashboard
            // Local dev overrides can go here
            env: {
                NODE_ENV: 'development',
                PORT: 3000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
        },
    ],
};