/* --- ADD THIS TO YOUR EXISTING app.js --- */

// 1. CHAT LOGIC
const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-box');

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== "") {
        const msg = chatInput.value;
        const msgData = {
            sender: peer.id,
            text: msg,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        // Push message to Firebase
        db.ref('strive-ops-chat').push(msgData);
        chatInput.value = "";
    }
});

// Listen for new messages
db.ref('strive-ops-chat').limitToLast(20).on('child_added', (snapshot) => {
    const data = snapshot.val();
    const isMe = data.sender === peer.id;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `p-2 rounded-lg max-w-[90%] ${isMe ? 'ml-auto bg-blue-600' : 'bg-gray-800'}`;
    msgDiv.innerHTML = `
        <p class="text-[9px] font-bold opacity-50 uppercase">${isMe ? 'You' : 'Expert'}</p>
        <p class="text-[11px]">${data.text}</p>
    `;
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// 2. MEMBER LIST SYNC
// Update your initNetworking() function's open event:
function initNetworking() {
    peer = new Peer("so-" + Date.now().toString().slice(-4), { 
        host: '0.peerjs.com', port: 443, secure: true 
    });
    
    peer.on('open', id => {
        document.getElementById('my-id').innerText = "NODE ID: " + id;
        
        // Register this user in the member list
        const myMemberRef = db.ref('strive-ops-members').child(id);
        myMemberRef.set({ id: id, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        myMemberRef.onDisconnect().remove();
    });

    // Handle the Member List UI
    db.ref('strive-ops-members').on('value', (snapshot) => {
        const memberList = document.getElementById('member-list');
        memberList.innerHTML = "";
        
        snapshot.forEach((child) => {
            const val = child.val();
            const isMe = val.id === peer.id;
            
            memberList.innerHTML += `
                <div class="flex items-center gap-2 p-2 bg-white bg-opacity-5 rounded-lg border border-white border-opacity-5">
                    <span class="w-1.5 h-1.5 rounded-full ${isMe ? 'bg-green-500' : 'bg-blue-500'}"></span>
                    <span class="text-[10px] font-bold">${isMe ? 'Luis (Host)' : 'Expert-' + val.id.slice(-4)}</span>
                </div>
            `;
        });
    });

    // ... rest of your peer logic (calls, etc)
}

function copyInvite() {
    const id = peer.id;
    const url = window.location.href.split('?')[0] + "?join=" + id;
    navigator.clipboard.writeText(url).then(() => alert("Invite link copied to clipboard!"));
}
