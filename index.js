const os = require('os');
const net = require('net');
const fs = require('fs');

const yolo = require('@vapi/node-yolo');
const detector = new yolo(__dirname + '/darknet-configs', 'cfg/coco.data', 'cfg/yolov3.cfg', 'yolov3.weights');
const tempDir = os.tmpdir() + '/image-classification-server/';
const max_chunk_size=1024;
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
  let myCont=-1;
  let file_path=tempDir;
  let file_size=-1;
  let file_size_left=0;
  let write_stream=undefined;
  
  socket.on('data', function(data)
  {
   switch(state)
   {
    case 0:
     myCont=++counter;
     file_path += counter + data;
     state=1;
     break;
    case 1:
     file_size_left=file_size=data;
     state=2;
     write_stream=fs.createWriteStream(file_path,{
      autoClose:false,
      flags:'w',
      mode:0o750
     });
     console.log('file_path:'+file_path);
     console.log('file_size:'+file_size);
     break;
    case 2:
     if(data==null||data==undefined)
     {
      console.log('received null data');
      return;
     }
     
     if(file_size_left>max_chunk_size)
     {
      file_size_left-=max_chunk_size;
      write_stream.write(data);
      console.log(file_path + ': wrote '+ file_size + ':' + file_size_left);
     }
     else
     {
      file_size_left-=file_size_left;
      write_stream.end(data);
      console.log(file_path + ': end '+ (file_size-file_size_left));
      detector.detect(file_path)
      .then(detections =>
      {
       let json = JSON.stringify(detections);
       socket.write(json, 'utf8');
      })
      .catch(error =>
      {
       console.error(error);
      });
     }
     break;
   }
  });
 });
 
 server.listen(1337, '0.0.0.0');
});