/* ============================================================
   STRIVE VIDEO CENTER (SVC) - PRODUCTION ENGINE v3.0
   ============================================================ */

// 1. CONFIG (Replace with your actual Gemini Key)
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const firebaseConfig = {
    apiKey: "AIzaSyA0gT_lJAxNDdlYHg7uiU6XUdqSPRgShvs",
    authDomain: "strive-video-center.firebaseapp.com",
    databaseURL: "https://strive-video-center-default-rtdb.firebaseio.com",
    projectId: "strive-video-center"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const sessionRef = db.ref("svc-sessions");

// App Global State
let peer, localStream, selfieSegmentation;
let bgMode = 'none'; 
let customBgImage = new Image();
let isImageLoaded = false;

const canvasElement = document.createElement('canvas');
const canvasCtx = canvasElement.getContext('2d');

/* 2. CORE MEDIA ENGINE */
async function getMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Setup MediaPipe AI
        selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });
        selfieSegmentation.setOptions({ modelSelection: 1 });
        selfieSegmentation.onResults(onAIResults);

        const inputVideo = document.createElement('video');
        inputVideo.srcObject = stream;
        inputVideo.muted = true;
        inputVideo.play();

        async function renderLoop() {
            if (selfieSegmentation) await selfieSegmentation.send({image: inputVideo});
            requestAnimationFrame(renderLoop);
        }
        renderLoop();

        const aiVideoTrack = canvasElement.captureStream(30).getVideoTracks()[0];
        localStream = new MediaStream([aiVideoTrack, stream.getAudioTracks()[0]]);
        document.getElementById('local-video').srcObject = localStream;
    } catch (e) {
        console.error("Camera Hardware Error:", e);
    }
}

function onAIResults(results) {
    canvasElement.width = 640; canvasElement.height = 480;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,640,480);
    
    if (bgMode === 'none') {
        canvasCtx.drawImage(results.image, 0,0,640,480);
    } else {
        canvasCtx.filter = 'blur(2px)';
        canvasCtx.drawImage(results.segmentationMask, 0,0,640,480);
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.filter = 'none';
        canvasCtx.drawImage(results.image, 0,0,640,480);
        canvasCtx.globalCompositeOperation = 'destination-atop';
        
        if (bgMode === 'blur') {
            canvasCtx.filter = 'blur(15px)';
            canvasCtx.drawImage(results.image, 0,0,640,480);
        } else if (bgMode === 'color') {
            canvasCtx.fillStyle = '#0a0f1d';
            canvasCtx.fillRect(0,0,640,480);
        } else if (bgMode === 'image' && isImageLoaded) {
            canvasCtx.drawImage(customBgImage, 0,0,640,480);
        }
    }
    canvasCtx.restore();
}

/* 3. SECURE NETWORKING (PeerJS) */
// Using a forced unique ID based on timestamp to avoid collision
const forcedId = "svc-" + Date.now().toString().slice(-6);

peer = new Peer(forcedId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    debug: 1
});

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    
    // Register Presence in Firebase
    const myRef = sessionRef.child(id);
    myRef.set({ peerId: id, active: true });
    myRef.onDisconnect().remove();

    // Check for URL Invite
    const invite = new URLSearchParams(window.location.search).get('join');
    if(invite) {
        document.getElementById('remote-id').value = invite;
        document.getElementById('lobby-overlay').classList.remove('hidden');
        setTimeout(startCall, 2000);
    }
});

peer.on('call', (call) => {
    if (!localStream) getMedia().then(() => call.answer(localStream));
    else call.answer(localStream);
    call.on('stream', (remoteStream) => {
        document.getElementById('remote-video').srcObject = remoteStream;
    });
});

async function startCall() {
    const rId = document.getElementById('remote-id').value;
    if (!rId) return;
    if (!localStream) await getMedia();
    const call = peer.call(rId, localStream);
    call.on('stream', (rStream) => {
        document.getElementById('remote-video').srcObject = rStream;
        document.getElementById('lobby-overlay').classList.add('hidden');
    });
}

/* 4. FIREBASE SYNC */
sessionRef.on("value", (snapshot) => {
    const list = document.getElementById('member-list');
    list.innerHTML = "";
    snapshot.forEach((child) => {
        const val = child.val();
        const isMe = val.peerId === peer.id;
        list.innerHTML += `
            <div class="flex items-center justify-between p-3 mb-2 rounded-xl bg-white bg-opacity-5 border border-white border-opacity-10 text-[10px] font-bold">
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500' : 'bg-blue-500'}"></span> 
                    ${isMe ? 'You (Host)' : 'Guest (' + val.peerId.substring(0,4) + ')'}
                </div>
            </div>`;
    });
});

/* 5. UI CONTROLS */
function setBgMode(m) { 
    bgMode = m; 
    document.querySelectorAll('.btn-action').forEach(b => b.classList.remove('btn-active'));
    document.getElementById('btn-'+m).classList.add('btn-active');
}

function loadCustomBackground(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        customBgImage.src = ev.target.result;
        customBgImage.onload = () => { isImageLoaded = true; setBgMode('image'); };
    };
    reader.readAsDataURL(e.target.files[0]);
}

function toggleMic() { localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled; document.getElementById('toggle-mic').classList.toggle('bg-red-600'); }
function toggleCam() { localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled; document.getElementById('toggle-cam').classList.toggle('bg-red-600'); }

async function startTranscription() {
    document.getElementById('ai-status').innerText = "LIVE ANALYZING";
    const recorder = new MediaRecorder(localStream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = async (e) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: "POST",
                body: JSON.stringify({ contents: [{ parts: [{ text: "Transcribe precisely:" }, { inline_data: { mime_type: "audio/webm", data: base64 } }] }] })
            });
            const data = await res.json();
            const text = data.candidates[0].content.parts[0].text;
            if(text.trim()) {
                const box = document.getElementById('transcript-box');
                if(box.innerText.includes("Waiting")) box.innerHTML = "";
                box.innerHTML += `<div class="p-3 bg-gray-800 bg-opacity-40 rounded-lg text-xs mb-3 border-l-2 border-blue-500">${text}</div>`;
                box.scrollTop = box.scrollHeight;
            }
        };
        reader.readAsDataURL(e.data);
    };
    recorder.start();
    setInterval(() => { if(recorder.state === "recording") recorder.requestData(); }, 10000);
}

getMedia(); // Boot hardware
