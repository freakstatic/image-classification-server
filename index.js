const os = require('os');
const net = require('net');
const fs = require('fs');

const yolo = require('@vapi/node-yolo');
const detector = new yolo(__dirname + '/darknet-configs', 'cfg/coco.data', 'cfg/yolov3.cfg', 'yolov3.weights');
const tempDir = os.tmpdir() + '/image-classification-server/';

const max_times_without_data = 100;

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
  let time_with_out_data = 0;
  let last_bytes_written = -1;
  let json_with_detections = undefined;
  
  let send_an_ack = () =>
  {
   send_a_byte(1);
  };
  
  let send_a_nack = () =>
  {
   send_a_byte(-1);
  };
  
  let send_a_byte = (byte) =>
  {
   let json_size_buffer = Buffer.alloc(4, 0);
   json_size_buffer.writeInt32BE(byte, 0);
   socket.write(json_size_buffer);
  };
  
  let delete_file = () =>
  {
   fs.unlink(file_path, () =>
   {
   });
  };
  
  let close_writer = () =>
  {
   clearInterval(timmer);
   timmer = undefined;
   write_stream.end();
   write_stream = undefined;
  };
  
  let end_socket = () =>
  {
   if(write_stream !== undefined)
   {
    write_stream.off('finish', on_finish);
    close_writer();
   }
   delete_file();
   socket.end();
  };
  
  let reset_safe_mode = () =>
  {
   last_bytes_written = write_stream.bytesWritten;
   time_with_out_data = 0;
  };
  
  let process_response = (response) =>
  {
   json_with_detections = JSON.stringify(response);
   send_an_ack();
   state = 3;
  };
  
  let on_finish = () =>
  {
   detector.detect(file_path)
   .then(detections =>
   {
    process_response(detections);
   })
   .catch(error =>
   {
    console.error('Error classifying image ' + file_path + ' with error code: ' + error.errorCode + ' and message: ' + error.errorMessage);
    process_response(error);
   });
  };
  
  let init_writer = () =>
  {
   write_stream = fs.createWriteStream(file_path, {
    autoClose: false,
    flags: 'w',
    mode: 0o750
   });
   
   write_stream.on('finish', on_finish);
   
   write_stream.on('error', function(sock_err)
   {
    console.error(sock_err);
   });
   
   timmer = setInterval(() =>
   {
    if(write_stream.bytesWritten >= file_size)
    {
     close_writer();
     console.debug('file: ' + file_path + ' written and closed.');
    }
    else if(last_bytes_written === write_stream.bytesWritten)
    {
     if(time_with_out_data >= max_times_without_data)
     {
      console.log('recall + ' + file_path);
      write_stream.off('finish', on_finish);
      close_writer();
      delete_file();
      init_writer();
      send_a_nack();
     }
     time_with_out_data++;
    }
    else
    {
     reset_safe_mode();
    }
   }, 100);
  };
  
  socket.on('data', function(data)
  {
   switch(state)
   {
    case 0:
     myCont = ++counter;
     file_path += counter + data;
     state = 1;
     send_an_ack();
     break;
    
    case 1:
     file_size = parseInt(data);
     state = 2;
     init_writer();
     console.debug('file_path:' + file_path + '\nfile_size:' + file_size);
     send_an_ack();
     break;
    case 2:
     if(data == null || data === undefined)
     {
      return;
     }
     
     write_stream.write(data, (error) =>
     {
      if(error !== undefined || error != null)
      {
       console.error('Error on write file: ' + file_path + ' : ' + error);
      }
     });
     break;
    case 3:
     send_a_byte(Buffer.byteLength(json_with_detections, 'utf8'));
     state = 4;
     break;
    case 4:
     socket.write(json_with_detections, 'utf8');
     end_socket();
     break;
   }
  });
  
  socket.on('error', () =>
  {
   end_socket();
   socket.destroy();
   console.error('socket error:' + error);
  });
  
  socket.on('end', () =>
  {
   end_socket();
  });
  
  socket.on('timeout', () =>
  {
   end_socket();
  });
 });
 server.listen(1337, '0.0.0.0');
});