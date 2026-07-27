module.exports = {
  apps: [{
    name: "northline",
    script: "server.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      PORT: 9000,
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 4000,
  }],
};
