// 暴露公共API用于添加消息
window.addMessage = function(sender, content, isAI = true) {
    const messageContainer = document.getElementById('messageContainer');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isAI ? 'ai-message' : 'user-message'}`;

    const nameDiv = document.createElement('div');
    nameDiv.className = `message-name ${isAI ? 'ai-name' : ''}`;
    nameDiv.textContent = sender;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    
    // 使用 marked.js 渲染 Markdown
    bubbleDiv.innerHTML = marked.parse(content);

    messageDiv.appendChild(nameDiv);
    messageDiv.appendChild(bubbleDiv);
    messageContainer.appendChild(messageDiv);

    messageContainer.scrollTop = messageContainer.scrollHeight;
};

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'llm_processed') {
        addMessage('Artificial Intelligence', message.data.processed_content, true);
    }
});

// 暴露发送消息的方法
window.sendToServer = function(content) {
    const message = {
        type: 'responseCaptured',
        content: content,
        timestamp: new Date().toISOString()
    };
    chrome.runtime.sendMessage(message);
    addMessage('你', content, false);
};

// 监听开关按钮的变化
const toggleSwitch = document.getElementById('toggleSwitch');
toggleSwitch.addEventListener('change', function() {
    const isEnabled = this.checked;
    chrome.runtime.sendMessage({
        type: 'toggleSwitch',
        enabled: isEnabled
    });
});
