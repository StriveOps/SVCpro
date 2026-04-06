/* ============================================================
   STRIVE-OPS | CROSS-STATE ENGINE v6.5
   Founder: Luis Morales Otero
   ============================================================ */

const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

// Start Services
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const chatRef = db.ref("strive-ops-chat");
const memberRef = db.ref("strive-ops-members");

let peer, localStream, selfieSegmentation, bgMode = 'none';
const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');
let activeCalls = new Map();

// --- AUTO-LAUNCH ---
window.onload = async () => {
    try {
        await updateDeviceList();
        await getMedia();
        initNetworking();
    } catch (e) {
        console.error("Hardware Blocked:", e);
    }
};

/* --- 1. AI VIDEO CORE --- */
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

    // Hot-swap existing calls
    activeCalls.forEach(call => {
        const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
        if(sender) sender.replaceTrack(track);
    });
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

/* --- 2. GLOBAL NETWORKING (STUN/ICE) --- */
function initNetworking() {
    const id = "so-" + Math.random().toString(36).substr(2, 5);
    
    // Configured for cross-state firewall traversal
    peer = new Peer(id, { 
        host: '0.peerjs.com', 
        port: 443, 
        secure: true,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });
    
    peer.on('open', nid => {
        document.getElementById('my-id').innerText = "NODE: " + nid;
        
        // Sync Presence to Firebase
        const presence = memberRef.child(nid);
        presence.set({ id: nid, name: "Expert-" + nid.slice(-3), ts: Date.now() });
        presence.onDisconnect().remove();

        // Handle URL Joins
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

/* --- 3. TEAM SYNC --- */
memberRef.on('value', (snap) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snap.forEach(child => {
        const m = child.val();
        const isMe = m.id === peer.id;
        list.innerHTML += `<div class="flex items-center gap-2 p-2 bg-white bg-opacity-5 rounded border border-white border-opacity-5">
            <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500' : 'bg-blue-500'}"></span>
            <span class="text-[9px] font-bold uppercase tracking-tighter">${isMe ? 'Luis (Host)' : m.name}</span>
        </div>`;
    });
});

chatRef.limitToLast(10).on('child_added', (snap) => {
    const d = snap.val();
    const box = document.getElementById('chat-box');
    const isMe = d.sender === peer.id;
    const msg = document.createElement('div');
    msg.className = `p-2 rounded max-w-[85%] ${isMe ? 'ml-auto bg-blue-600' : 'bg-gray-800 shadow-sm'}`;
    msg.innerHTML = `<p class="text-[10px]">${d.text}</p>`;
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        chatRef.push({ sender: peer.id, text: e.target.value, ts: firebase.database.ServerValue.TIMESTAMP });
        e.target.value = "";
    }
});

/* --- 4. GALLERY UI --- */
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

function removeRemoteVideo(id) {
    const el = document.getElementById(`container-${id}`);
    if(el) el.remove();
    activeCalls.delete(id);
    document.getElementById('video-grid').className = "grid-cols-1";
}

async function startCall(targetId = null) {
    const rId = targetId || document.getElementById('remote-id').value;
    if(!rId || rId === peer.id) return;
    const call = peer.call(rId, localStream);
    activeCalls.set(rId, call);
    call.on('stream', r => addRemoteVideo(r, rId));
}

/* --- 5. HELPERS --- */
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
