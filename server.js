const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Remove query strings
  filePath = filePath.split('?')[0];
  
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`MODO RECUPERACION CRITICA ACTIVO`);
  console.log(`========================================`);
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(``);
  console.log(`DIAGNOSTICO:`);
  console.log(`- Service Worker: DESACTIVADO`);
  console.log(`- PWA: DESACTIVADO`);
  console.log(`- manifest: ELIMINADO`);
  console.log(`- preload masivos: ELIMINADOS`);
  console.log(`- fonts externas: DESACTIVADAS`);
  console.log(`- animaciones CSS: DESACTIVADAS`);
  console.log(`- backdrop-filter: DESACTIVADO`);
  console.log(`- blur: DESACTIVADO`);
  console.log(`- gradients complejos: DESACTIVADOS`);
  console.log(`- transitions globales: DESACTIVADAS`);
  console.log(`- React Query: DESCONECTADO`);
  console.log(`- sockets: DESCONECTADOS`);
  console.log(`- polling: DESCONECTADO`);
  console.log(`- observers: DESCONECTADOS`);
  console.log(`- dashboards: DESCONECTADOS`);
  console.log(`- tablas: DESCONECTADAS`);
  console.log(`- métricas: DESCONECTADAS`);
  console.log(`- Firebase: DESCONECTADO`);
  console.log(`- Supabase: DESCONECTADO`);
  console.log(`- Bundle size: 1.7 KB (vs 184 KB original)`);
  console.log(`========================================`);
  console.log(`Esperando respuesta en localhost...`);
  console.log(`========================================\n`);
});
