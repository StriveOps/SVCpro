/* ============================================================
   STRIVE-OPS | OPERATIONS COMMAND CENTER ENGINE v5.8
   Founder: Luis Morales Otero
   ============================================================ */

// 1. CONFIGURATION
const GEMINI_API_KEY = "YOUR_GEMINI_KEY_HERE"; 
const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("strive-ops-sessions");
const chatRef = db.ref("strive-ops-chat");
const memberRef = db.ref("strive-ops-members");

// Global State
let peer, localStream, screenStream, selfieSegmentation;
let bgMode = 'none';
let activeCalls = new Map();

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');

/* --- 2. BOOT & HARDWARE --- */
async function bootSystem() {
    const status = document.getElementById('boot-status');
    try {
        status.innerText = "Accessing Hardware...";
        await updateDeviceList();
        await getMedia();
        
        status.innerText = "Initializing Network...";
        initNetworking();

        document.getElementById('boot-screen').style.display = 'none';
    } catch (err) {
        status.innerText = "BOOT ERROR: " + err.message;
        status.style.color = "#ef4444";
    }
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

async function getMedia() {
    const vId = document.getElementById('video-source').value;
    const aId = document.getElementById('audio-source').value;
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    try {
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

        // Hot-swap tracks for active calls
        activeCalls.forEach(call => {
            const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if(sender) sender.replaceTrack(track);
        });
    } catch(e) { console.error("Hardware Fail:", e); }
}

function onAIResults(r) {
    canvasElement.width = 1280; canvasElement.height = 720;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,1280,720);
    canvasCtx.drawImage(r.segmentationMask, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.filter = 'blur(3px)'; // Smoother edges
    canvasCtx.drawImage(r.image, 0,0,1280,720);
    canvasCtx.globalCompositeOperation = 'destination-atop';
    
    if(bgMode === 'blur') { 
        canvasCtx.filter = 'blur(20px) brightness(0.6)'; 
        canvasCtx.drawImage(r.image, 0,0,1280,720); 
    } else if (bgMode === 'none') {
        canvasCtx.filter = 'none';
        canvasCtx.drawImage(r.image, 0,0,1280,720);
    }
    canvasCtx.restore();
}

/* --- 3. NETWORKING & SYNC --- */
function initNetworking() {
    const nodeId = "so-" + Date.now().toString().slice(-4);
    peer = new Peer(nodeId, { host: '0.peerjs.com', port: 443, secure: true });

    peer.on('open', id => {
        document.getElementById('my-id').innerText = "NODE ID: " + id;
        
        // Register Presence
        const presenceRef = memberRef.child(id);
        presenceRef.set({ id: id, name: "Expert-" + id.slice(-4), online: true });
        presenceRef.onDisconnect().remove();

        // Check for Auto-Join
        const urlParams = new URLSearchParams(window.location.search);
        if(urlParams.has('join')) startCall(urlParams.get('join'));
    });

    peer.on('call', call => {
        activeCalls.set(call.peer, call);
        call.answer(localStream);
        call.on('stream', r => addRemoteVideo(r, call.peer));
        call.on('close', () => removeRemoteVideo(call.peer));
    });
}

function addRemoteVideo(remoteStream, peerId) {
    if (document.getElementById(`container-${peerId}`)) return;
    const grid = document.getElementById('video-grid');
    
    const container = document.createElement('div');
    container.id = `container-${peerId}`;
    container.className = "video-container relative h-full";
    
    const video = document.createElement('video');
    video.srcObject = remoteStream;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = "absolute top-2 left-2 bg-black bg-opacity-60 px-2 py-1 rounded text-[8px] font-bold uppercase";
    label.innerText = `EXPERT: ${peerId.slice(-4)}`;
    
    container.appendChild(video);
    container.appendChild(label);
    grid.appendChild(container);
}

function removeRemoteVideo(peerId) {
    const el = document.getElementById(`container-${peerId}`);
    if(el) el.remove();
    activeCalls.delete(peerId);
}

async function startCall(targetId = null) {
    const rId = targetId || document.getElementById('remote-id').value;
    if (!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

/* --- 4. TEAM CHAT & MEMBER LIST --- */
memberRef.on('value', (snapshot) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snapshot.forEach(child => {
        const m = child.val();
        const isMe = m.id === peer.id;
        list.innerHTML += `
            <div class="flex items-center gap-2 p-2 bg-white bg-opacity-5 rounded border border-white border-opacity-5">
                <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500' : 'bg-blue-500'}"></span>
                <span class="text-[10px] font-bold uppercase">${isMe ? 'Luis (Host)' : m.name}</span>
            </div>`;
    });
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        chatRef.push({
            sender: peer.id,
            text: e.target.value,
            ts: firebase.database.ServerValue.TIMESTAMP
        });
        e.target.value = "";
    }
});

chatRef.limitToLast(15).on('child_added', (snapshot) => {
    const data = snapshot.val();
    const box = document.getElementById('chat-box');
    const isMe = data.sender === peer.id;
    
    const msg = document.createElement('div');
    msg.className = `p-2 rounded max-w-[85%] ${isMe ? 'ml-auto bg-blue-600' : 'bg-gray-800'}`;
    msg.innerHTML = `<p class="text-[11px]">${data.text}</p>`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
});

/* --- 5. UI CONTROLS --- */
function setBgMode(m) { bgMode = m; }
function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; }

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
