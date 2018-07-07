var net = require('net');

const yolo = require('@vapi/node-yolo');
const detector = new yolo(__dirname + "/darknet-configs", "cfg/coco.data", "cfg/yolov3.cfg", "yolov3.weights");
var server = net.createServer(function (socket) {

    socket.on('data', (data) => {
        data = data.toString();
        detector.detect(data)
            .then(detections => {

                let buffer = new Buffer(4);

                let json = JSON.stringify(detections);
                let bytesToSend = Buffer.byteLength(json);
                buffer.writeUInt32BE(bytesToSend);

                socket.write(buffer, null, () => {
                    socket.write(json);
                });

            })
            .catch(error => {
                console.error(error);
            });
    });
});

server.listen(1337, '127.0.0.1');
