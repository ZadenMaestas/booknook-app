import livereload from 'livereload';

const server = livereload.createServer();
server.watch([__dirname + '/views', __dirname + '/public']);
console.log('Livereload watching views/ and public/');
