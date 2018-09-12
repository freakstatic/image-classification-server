const os = require('os');
const net = require('net');
const fs = require('fs');

const yolo = require('@vapi/node-yolo');
const detector = new yolo(__dirname + '/darknet-configs', 'cfg/coco.data', 'cfg/yolov3.cfg', 'yolov3.weights');
const tempDir = os.tmpdir() + '/image-classification-server/';

const max_times_without_data = 100;

let counter = -1;

fs.mkdir(tempDir, 0o750, (error) => {
    if (error && error.code !== 'EEXIST') {
        console.error(error);
        return;
    }
    const server = net.createServer(function (socket) {
        let state = 0;
        let myCont = -1;
        let file_path = tempDir;
        let file_size = -1;
        let timmer = undefined;
        let write_stream = undefined;
        let time_with_out_data = 0;
        let last_bytes_written = -1;

        let sendAnAck = () => {
            sendAByte(1);
        };

        let sendANack = () => {
            sendAByte(-1);
        };

        let sendAByte = (byte) => {
            let json_size_buffer = Buffer.alloc(4, 0);
            json_size_buffer.writeInt32BE(byte, 0);
            socket.write(json_size_buffer);
        };

        let deleteFile = () => {
            fs.unlink(file_path, () => {
            });
        };

        let closeWriter = () => {
            clearInterval(timmer);
            timmer = undefined;
            write_stream.end();
            write_stream = undefined;
        };

        let endSocket = () => {
            if (write_stream !== undefined) {
                write_stream.off('finish', onFinish);
                closeWriter();
            }
            deleteFile();
            socket.end();
        };

        let resetSafeMode = () => {
            last_bytes_written = write_stream.bytesWritten;
            time_with_out_data = 0;
        };

        let onFinish = () => {
            detector.detect(file_path)
                .then(detections => {
                    let json_with_detections = JSON.stringify(detections);
                    sendAByte(Buffer.byteLength(json_with_detections, 'utf8'));
                    socket.write(json_with_detections, 'utf8');
                    endSocket();
                })
                .catch(error => {
                    console.error(error);
                    deleteFile();
                });
        };

        let initWriter = () => {
            write_stream = fs.createWriteStream(file_path, {
                autoClose: false,
                flags: 'w',
                mode: 0o750
            });

            write_stream.on('finish', onFinish);

            write_stream.on('error', function (sock_err) {
                console.error(sock_err);
            });

            timmer = setInterval(() => {
                if (write_stream.bytesWritten >= file_size) {
                    closeWriter();
                    console.debug('file: ' + file_path + ' written and closed.');
                }
                else if (last_bytes_written === write_stream.bytesWritten) {
                    if (time_with_out_data >= max_times_without_data) {
                        console.log('recall + ' + file_path);
                        write_stream.off('finish', onFinish);
                        closeWriter();
                        deleteFile();
                        initWriter();
                        sendANack();
                    }
                    time_with_out_data++;
                }
                else {
                    resetSafeMode();
                }
            }, 100);
        };

        socket.on('data', function (data) {
            switch (state) {
                case 0:
                    myCont = ++counter;
                    file_path += counter + data;
                    state = 1;
                    sendAnAck();
                    break;

                case 1:
                    file_size_left = file_size = parseInt(data);
                    state = 2;
                    initWriter();
                    console.debug('file_path:' + file_path + '\nfile_size:' + file_size);
                    sendAnAck();
                    break;
                case 2:
                    if (data == null || data === undefined) {
                        return;
                    }

                    write_stream.write(data, (error) => {
                        if (error !== undefined || error != null) {
                            console.error('Error on write file: ' + file_path + ' : ' + error);
                        }
                    });
                    break;
            }
        });

        socket.on('error', () => {
            endSocket();
            socket.destroy();
            console.error('socket error:' + error);
        });

        socket.on('end', () => {
            endSocket();
        });

        socket.on('timeout', () => {
            endSocket();
        })
    });
    server.listen(1337, '0.0.0.0');
});