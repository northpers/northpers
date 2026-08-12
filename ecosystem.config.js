module.exports = {
  apps: [
    {
      name: 'northline',
      script: 'backend/server.js',
      cwd: '/home/hostinesia/northline',
      env: {
        NODE_ENV: 'production',
        PORT: 9001,
        WHATSAPP_WORKER: '1',
      },
    },
    {
      name: 'northline-2',
      script: 'backend/server.js',
      cwd: '/home/hostinesia/northline',
      env: {
        NODE_ENV: 'production',
        PORT: 9002,
        WHATSAPP_WORKER: '0',
      },
    },
  ],
};
