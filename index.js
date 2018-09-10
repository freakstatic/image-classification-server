const os = require('os');
const net = require('net');
const fs = require('fs');

const yolo = require('@vapi/node-yolo');
const detector = new yolo(__dirname + '/darknet-configs', 'cfg/coco.data', 'cfg/yolov3.cfg', 'yolov3.weights');
const tempDir = os.tmpdir() + '/image-classification-server/';
const max_chunk_size = 1024;
let counter = -1;

fs.mkdir(tempDir, 0o750, (error) =>
{
 if(error && error.code !== 'EEXIST')
 {
  console.error(error);
  return;
 }
 const server = net.createServer(function(socket)
 {
  let state = 0;
  let myCont = -1;
  let file_path = tempDir;
  let file_size = -1;
  let timmer = undefined;
  let write_stream = undefined;
  
  socket.on('data', function(data)
  {
   switch(state)
   {
    case 0:
     myCont = ++counter;
     file_path += counter + data;
     state = 1;
     break;
    
    case 1:
     file_size_left = file_size = parseInt(data);
     state = 2;
     
     write_stream = fs.createWriteStream(file_path, {
      autoClose: false,
      flags: 'w',
      mode: 0o750
     });
     write_stream.on('finish', function()
     {
      detector.detect(file_path)
      .then(detections =>
      {
       let json = JSON.stringify(detections);
       let json_size_buffer=Buffer.alloc(4,0);
       json_size_buffer.writeInt32BE(Buffer.byteLength(json, 'utf8'),0);
       socket.write(json_size_buffer);
       socket.end(json, 'utf8');
      })
      .catch(error =>
      {
       console.error(error);
      });
     });
     
     write_stream.on('error', function(sock_err)
     {
      console.error(sock_err);
     });
     
     timmer = setInterval(() =>
     {
      if(write_stream.bytesWritten >= file_size)
      {
       clearInterval(timmer);
       write_stream.end();
       console.debug('file: ' + file_path + ' written and closed.');
      }
     }, 100);
     
     console.debug('file_path:' + file_path + '\nfile_size:' + file_size);
     break;
    case 2:
     
     if(data == null || data === undefined)
     {
      write_stream.end();
      return;
     }
     
     write_stream.write(data, (error) =>
     {
      if(error !== undefined || error != null)
      {
       console.log(error);
      }
     });
     break;
   }
  });
 });
 
 server.listen(1337, '0.0.0.0');
});