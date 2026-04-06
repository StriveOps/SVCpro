/* ============================================================
   STRIVE-OPS | PRODUCTION ENGINE v5.6 (STABLE)
   ============================================================ */

const GEMINI_API_KEY = "YOUR_GEMINI_KEY"; 
const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("strive-ops-sessions");

let peer, localStream, screenStream, selfieSegmentation;
let bgMode = 'none';
let activeCalls = [];

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');

/* --- BOOT SEQUENCE --- */
async function bootSystem() {
    document.getElementById('boot-screen').style.display = 'none';
    await updateDeviceList();
    await getMedia();
    initNetworking();
}

async function getMedia() {
    const vId = document.getElementById('video-source').value;
    const aId = document.getElementById('audio-source').value;
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: vId ? {exact: vId} : undefined, width: 1280, height: 720 },
            audio: { deviceId: aId ? {exact: aId} : undefined }
        });

        // Initialize MediaPipe
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

        // Auto-update calls
        activeCalls.forEach(c => {
            const s = c.peerConnection.getSenders().find(sn => sn.track.kind === 'video');
            if(s) s.replaceTrack(track);
        });
    } catch(e) { console.error("Media Error:", e); }
}

function onAIResults(r) {
    canvasElement.width = 1280; canvasElement.height = 720;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,1280,720);
    canvasCtx.drawImage(r.segmentationMask, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.filter = 'blur(3px)';
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'destination-atop';
    canvasCtx.filter = 'none';
    
    if(bgMode === 'blur') { 
        canvasCtx.filter = 'blur(20px) brightness(0.6)'; 
        canvasCtx.drawImage(r.image, 0,0,1280,720); 
    } else { 
        canvasCtx.drawImage(r.image, 0,0,1280,720); 
    }
    canvasCtx.restore();
}

/* --- NETWORKING --- */
function initNetworking() {
    peer = new Peer("so-" + Date.now().toString().slice(-4), { host: '0.peerjs.com', port: 443, secure: true });
    
    peer.on('open', id => {
        document.getElementById('my-id').innerText = "NODE ID: " + id;
        sessionRef.child(id).set({ peerId: id, ts: firebase.database.ServerValue.TIMESTAMP });
        sessionRef.child(id).onDisconnect().remove();
    });

    peer.on('call', call => {
        activeCalls.push(call);
        call.answer(localStream);
        call.on('stream', r => addRemoteVideo(r, call.peer));
        call.on('close', () => {
            const el = document.getElementById(`container-${call.peer}`);
            if(el) el.remove();
            updateGridLayout();
        });
    });
}

function addRemoteVideo(remoteStream, peerId) {
    const grid = document.getElementById('video-grid');
    if (document.getElementById(`container-${peerId}`)) return;

    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = "video-container relative h-full";
    
    const video = document.createElement('video');
    video.srcObject = remoteStream;
    video.autoplay = true;
    video.playsInline = true;
    
    container.appendChild(video);
    grid.appendChild(container);
    updateGridLayout();
}

function updateGridLayout() {
    const grid = document.getElementById('video-grid');
    const count = grid.children.length;
    grid.className = (count <= 1) ? "grid-cols-1" : "grid-cols-2";
}

async function startCall() {
    const rId = document.getElementById('remote-id').value;
    const call = peer.call(rId, localStream);
    activeCalls.push(call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

/* --- UTILS --- */
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

async function toggleScreenShare() {
    try {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const track = screenStream.getVideoTracks()[0];
            activeCalls.forEach(c => {
                const s = c.peerConnection.getSenders().find(sn => sn.track.kind === 'video');
                if (s) s.replaceTrack(track);
            });
            document.getElementById('local-video').srcObject = screenStream;
            track.onended = () => toggleScreenShare();
        } else {
            const track = localStream.getVideoTracks()[0];
            activeCalls.forEach(c => {
                const s = c.peerConnection.getSenders().find(sn => sn.track.kind === 'video');
                if (s) s.replaceTrack(track);
            });
            document.getElementById('local-video').srcObject = localStream;
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }
    } catch(e) {}
}

function toggleChat() { document.getElementById('ai-sidebar').classList.toggle('hidden'); }
function setBgMode(m) { bgMode = m; }
function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }
