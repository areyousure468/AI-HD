// 存储捕获的回复
let capturedResponses = [];
let lastMessageTime = 0; // 上次接收消息的时间戳
const MESSAGE_THROTTLE_TIME = 3000; // 节流时间（毫秒）
let isSwitchEnabled = true; // 开关状态

// 大模型配置（请替换为你的真实密钥）
const API_KEY = "bce-v3/ALTAK-2QsibrEnUYKVuQzyM9fWa/73f0468ad3042977897d50ce2cc3448fd419768e";
const APP_ID = "app-bw7f2FuU";
const BASE_URL = "https://qianfan.baidubce.com/v2";
const MODEL = "ernie-4.5-turbo-32k";

// 初始化大模型客户端
class DynamicLLM {
    constructor() {
        this.base_url = BASE_URL;
        this.api_key = API_KEY;
        this.app_id = APP_ID;
        this.model = MODEL;
        this._last_response = null;
    }

    async call_llm(user_input) {
        try {
            const system_prompt = "你是一个AI幻觉检测员，你的任务是检查交给你的AI回复中是否存在事实性错误，客观性错误，在有争议的方面以及主观性判断的上面不做对错的判断，举例（只是举例，包括且不局限于以下几个点）：事实性错误举例1.\"黄河是中国最长的河流\"（实际长江最长，黄河第二）2.\"明朝建立于1386年\"（正确是1368年）3.\"水的沸点总是100℃\"（未说明标准大气压条件）4.\"25的平方根是4\"（正确应为5）具有争议性话题举例1.\"拿破仑对欧洲的影响主要是积极的\"2.\"量化宽松政策利大于弊\"3.\"毕加索比达芬奇更伟大\"主观性判断举例1.\"古典音乐比摇滚乐更好听\"2.\"香菜的味道令人愉悦\"3.\"个人自由比集体利益更重要\"所有错误都只来自于事实性错误，客观性错误";
            const headers = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.api_key}`,
                "appid": this.app_id
            };
            const body = {
                model: this.model,
                messages: [
                    { "role": "system", "content": [{"type": "text", "text": system_prompt}] }, 
                    { "role": "user", "content": [{"type": "text", "text": user_input}]}
                ],
                extra_body: {
                    web_search: {
                        enable: true,
                        enable_citation: false,
                        enable_trace: false
                    }
                }
            };
            const response = await fetch(this.base_url + "/chat/completions", {
                method: "POST",
                headers: headers,
                body: JSON.stringify(body)
            });
            const data = await response.json();
            this._last_response = data;
            return data;
        } catch (e) {
            console.error(`大模型调用错误: ${e}`);
            return null;
        }
    }

    get_last_response_content() {
        if (this._last_response) {
            return this._last_response.choices[0].message.content;
        }
        return null;
    }
}

const llm = new DynamicLLM();

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'toggleSwitch') {
        isSwitchEnabled = message.enabled;
        console.log('开关状态已更新:', isSwitchEnabled);
    } else if (message.type === 'responseCaptured') {
        if (!isSwitchEnabled) {
            console.log('开关已关闭，消息被过滤');
            return;
        }

        const currentTime = Date.now();

        // 检查是否在节流时间内
        if (currentTime - lastMessageTime < MESSAGE_THROTTLE_TIME) {
            console.log('消息被过滤（节流）:', currentTime - lastMessageTime, 'ms');
            return; // 直接忽略本次消息
        }

        // 更新上次接收消息的时间
        lastMessageTime = currentTime;

        // 记录捕获的回复（不包含isSpecial字段）
        const response = {
            content: message.content,
            timestamp: new Date().toISOString()
        };
        capturedResponses.push(response);

        console.log('已捕获AI回复，共记录:', capturedResponses.length, '条回复');

        // 调用大模型处理
        const llm_response = await llm.call_llm(response.content);

        if (llm_response) {
            const processed_content = llm.get_last_response_content();
            console.log(`大模型回复: ${processed_content}`);
            // 发送消息到侧边栏
            chrome.runtime.sendMessage({
                type: 'llm_processed',
                data: {
                    original_content: response.content,
                    processed_content: processed_content,
                    timestamp: response.timestamp
                }
            });
        }
    } else if (message.type === 'getCapturedResponses') {
        // 处理来自其他脚本的请求，返回捕获的回复信息
        sendResponse({ capturedResponses });
        return true; // 保持消息通道打开，直到异步操作完成
    }
});

// 监听插件点击事件
chrome.action.onClicked.addListener((tab) => {
    // 插件被点击时的操作
    console.log('插件被点击');
});