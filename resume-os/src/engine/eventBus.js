// 엔진 내부/메인 프로세스/renderer 간 이벤트 전달을 위한 EventEmitter 버스
const { EventEmitter } = require('events');

const bus = new EventEmitter();

module.exports = bus;

