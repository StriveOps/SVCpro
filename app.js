/* ============================================================
   STRIVE-OPS | INSTANT-ON ENGINE v6.3
   ============================================================ */

const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

// Start Cloud
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const chatRef = db.ref("strive-ops-chat");

let peer, localStream, selfieSegmentation, bgMode = 'none';
const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
let activeCalls = new Map();

// --- CRITICAL: THE AUTO-LOADER ---
window.onload = async () => {
    console.log("Strive-Ops: Initializing...");
    try {
        await updateDeviceList();
        await getMedia();
        initNetworking();
    } catch (e) {
        console.error("Auto-start failure:", e);
        alert("Camera access denied or hardware busy.");
    }
};

async function getMedia() {
    const vId = document.getElementById('video-source').value;
    const aId = document.getElementById('audio-source').value;
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: vId ? {exact: vId} : undefined, width: 1280, height: 720 },
        audio: { deviceId: aId ? {exact: aId} : undefined }
    });

    selfieSegmentation = new SelfieSegmentation({ 
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` 
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(onAIResults);

    const v = document.createElement('video');
    v.srcObject = stream; v.muted = true; v.play();
    const loop = async () => { 
        if(selfieSegmentation) await selfieSegmentation.send({image: v}); 
        requestAnimationFrame(loop); 
    };
    loop();

    const track = canvasElement.captureStream(30).getVideoTracks()[0];
    localStream = new MediaStream([track, stream.getAudioTracks()[0]]);
    document.getElementById('local-video').srcObject = localStream;
}

function onAIResults(r) {
    canvasElement.width = 1280; canvasElement.height = 720;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,1280,720);
    canvasCtx.drawImage(r.segmentationMask, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'destination-atop';
    canvasCtx.filter = (bgMode === 'blur') ? 'blur(20px) brightness(0.6)' : 'none';
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.restore();
}

function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    peer = new Peer(id, { host: '0.peerjs.com', port: 443, secure: true });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
        document.getElementById('my-id').classList.add('text-blue-400');
    });

    peer.on('call', call => {
        activeCalls.set(call.peer, call);
        call.answer(localStream);
        call.on('stream', r => addRemoteVideo(r, call.peer));
    });
}

async function updateDeviceList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vSelect = document.getElementById('video-source');
    const aSelect = document.getElementById('audio-source');
    vSelect.innerHTML = ""; aSelect.innerHTML = "";
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if(d.kind === 'videoinput') { opt.text = d.label || "Camera"; vSelect.add(opt); }
        else if(d.kind === 'audioinput') { opt.text = d.label || "Mic"; aSelect.add(opt); }
    });
}

function addRemoteVideo(stream, peerId) {
    const grid = document.getElementById('video-grid');
    if (document.getElementById(`container-${peerId}`)) return;
    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = "video-container relative h-full";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    container.appendChild(v);
    grid.appendChild(container);
    grid.className = (grid.children.length > 1) ? "grid-cols-2" : "grid-cols-1";
}

function startCall() {
    const rId = document.getElementById('remote-id').value;
    if(!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

// UI HANDLERS
function setBgMode(m) { bgMode = m; }
function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }

async function toggleScreenShare() {
    try {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = screenStream.getVideoTracks()[0];
            activeCalls.forEach(c => c.peerConnection.getSenders().find(s => s.track.kind === 'video').replaceTrack(track));
            document.getElementById('local-video').srcObject = screenStream;
            track.onended = () => toggleScreenShare();
        } else {
            const track = localStream.getVideoTracks()[0];
            activeCalls.forEach(c => c.peerConnection.getSenders().find(s => s.track.kind === 'video').replaceTrack(track));
            document.getElementById('local-video').srcObject = localStream;
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
    } catch(e) {}
}
