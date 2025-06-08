// 增强版DeepSeek回复捕获器 - 插件版本
(function() {
    // 确保只运行一次
    if (window.deepseekResponseCapturerRunning) {
        console.log('DeepSeek回复捕获器已在运行，跳过重复初始化');
        return;
    }
    window.deepseekResponseCapturerRunning = true;

    // 配置
    const CONFIG = {
        SELECTORS: {
            chatContainer: 'div._765a5cd',
            newResponseBlock: 'div._4f9bf79.d7dc56a8',
            completedResponse: 'div._4f9bf79._43c05b5',
            fullCompletedClass: '_4f9bf79 d7dc56a8 _43c05b5',
            contentBlock: 'div.ds-markdown--block',
            paragraphs: 'p.ds-markdown-paragraph',
            specialElement: 'div._660ca72'
        },
        INITIAL_RETRIES: 5,           // 初始查找聊天容器的重试次数
        RETRY_DELAY: 2000,            // 重试间隔(毫秒)
        STABILITY_DELAY: 300,         // DOM变化后等待的稳定时间
        OBSERVER_INIT_DELAY: 500      // 初始化观察者的延迟
    };

    // 工具类：元素ID生成器
    class ElementIdGenerator {
        static generateId(element) {
            const path = [];
            let current = element;
            while (current && current !== document.body) {
                const index = Array.from(current.parentNode.children).indexOf(current);
                path.unshift(index);
                current = current.parentNode;
            }
            
            // 添加时间戳，确保ID唯一性
            return `${path.join('-')}-${Date.now()}`;
        }
    }

    // 内容提取器
    class ContentExtractor {
        static extractFullResponse(target) {
            if (!target) return null;
            
            const contentBlock = target.querySelector(CONFIG.SELECTORS.contentBlock);
            if (!contentBlock) return null;

            const paragraphs = contentBlock.querySelectorAll(CONFIG.SELECTORS.paragraphs);
            const fullText = Array.from(paragraphs)
                .map(p => p.innerText.trim())
                .filter(text => text.length > 0)
                .join('\n\n');

            return fullText || null;
        }
    }

    // 消息传递服务
    class MessageService {
        static sendResponseCaptured(response) {
            try {
                chrome.runtime.sendMessage({
                    type: 'responseCaptured',
                    ...response
                });
            } catch (error) {
                console.error('发送消息失败:', error);
            }
        }
    }

    // 主控制器
    class DeepSeekResponseCapturer {
        constructor() {
            this.mainObserver = null;
            this.chatContainer = null;
            this.processedBlocks = new Set();
            this.retryCount = 0;
            this.currentSpecialElementId = null;
        }
        
        start() {
            console.log('DeepSeek回复捕获器已启动');
            this.initChatContainer();
        }
        
        initChatContainer() {
            this.chatContainer = document.querySelector(CONFIG.SELECTORS.chatContainer);
            
            if (!this.chatContainer) {
                this.retryCount++;
                
                if (this.retryCount <= CONFIG.INITIAL_RETRIES) {
                    console.log(`尝试查找聊天容器(${this.retryCount}/${CONFIG.INITIAL_RETRIES})...`);
                    setTimeout(() => this.initChatContainer(), CONFIG.RETRY_DELAY);
                } else {
                    console.error('无法找到聊天容器，初始化失败');
                }
                
                return;
            }
            
            console.log('成功找到聊天容器，初始化观察者...');
            setTimeout(() => {
                this.startMainObserver();
                this.checkExistingElements();
            }, CONFIG.OBSERVER_INIT_DELAY);
        }
        
        startMainObserver() {
            if (!this.chatContainer) return;
            
            // 如果已有监听器，先断开
            if (this.mainObserver) {
                this.mainObserver.disconnect();
            }
            
            console.log('初始化主监听器');
            
            this.mainObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        // 检查新增的特殊元素
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.matches(CONFIG.SELECTORS.specialElement)) {
                                this.currentSpecialElementId = ElementIdGenerator.generateId(node);
                                this.observeSpecialElement(node);
                            }
                        });
                        
                        // 检查新增的回复块
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.matches(CONFIG.SELECTORS.newResponseBlock)) {
                                const specialElement = document.querySelector(CONFIG.SELECTORS.specialElement);
                                
                                if (!specialElement) {
                                    // 没有特殊元素，处理普通回复
                                    this.observeResponseBlock(node, false);
                                } else {
                                    // 有特殊元素，标记当前特殊元素ID
                                    console.log('特殊元素存在，等待其消失后处理回复块');
                                }
                            }
                        });
                    }
                }
            });

            this.mainObserver.observe(this.chatContainer, {
                childList: true,
                subtree: true
            });
        }
        
        checkExistingElements() {
            console.log('检查现有元素...');
            
            // 检查现有特殊元素
            const specialElements = document.querySelectorAll(CONFIG.SELECTORS.specialElement);
            if (specialElements.length > 0) {
                // 只处理第一个特殊元素，其他忽略
                const firstSpecialElement = specialElements[0];
                this.currentSpecialElementId = ElementIdGenerator.generateId(firstSpecialElement);
                this.observeSpecialElement(firstSpecialElement);
            }
            
            // 检查现有回复块
            const specialElementExists = document.querySelector(CONFIG.SELECTORS.specialElement) !== null;
            document.querySelectorAll(CONFIG.SELECTORS.newResponseBlock).forEach(block => {
                if (!specialElementExists) {
                    this.observeResponseBlock(block, false);
                }
            });
        }
        
        observeSpecialElement(specialElement) {
            const elementId = ElementIdGenerator.generateId(specialElement);
            console.log(`开始监听特殊元素 ${elementId} 的消失`);
            
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        if (!document.body.contains(specialElement)) {
                            console.log(`特殊元素 ${elementId} 已消失`);
                            observer.disconnect();
                            
                            // 重置特殊元素ID
                            this.currentSpecialElementId = null;
                            
                            setTimeout(() => {
                                this.checkForNewResponseBlocks();
                            }, CONFIG.STABILITY_DELAY);
                        }
                    }
                }
            });

            observer.observe(specialElement.parentNode, {
                childList: true
            });
        }
        
        checkForNewResponseBlocks() {
            const newResponseBlocks = document.querySelectorAll(CONFIG.SELECTORS.newResponseBlock);
            if (newResponseBlocks.length > 0) {
                const latestBlock = newResponseBlocks[newResponseBlocks.length - 1];
                this.observeResponseBlock(latestBlock, true);
            }
        }
        
        observeResponseBlock(block, isSpecial = false) {
            const blockId = ElementIdGenerator.generateId(block);
            
            // 检查是否已处理
            if (this.processedBlocks.has(blockId)) {
                console.log(`回复块 ${blockId} 已处理，跳过`);
                return;
            }
            
            console.log(`开始监听回复块 ${blockId}`);
            this.processedBlocks.add(blockId);
            let hasCompleted = false;
            
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (!hasCompleted && block.className === CONFIG.SELECTORS.fullCompletedClass) {
                            hasCompleted = true;
                            
                            const responseText = ContentExtractor.extractFullResponse(block);
                            if (responseText) {
                                console.log(`捕获到${isSpecial ? '特殊' : '普通'}AI完整回复：\n`, responseText);
                                
                                MessageService.sendResponseCaptured({
                                    content: responseText,
                                    isSpecial,
                                    blockId
                                });
                            }
                            
                            // 立即释放资源
                            observer.disconnect();
                            
                            // 特殊回复处理完成后，清除所有已处理记录
                            if (isSpecial) {
                                console.log('特殊回复处理完成，重置已处理记录');
                                this.processedBlocks.clear();
                            } else {
                                // 普通回复处理完成后，只移除当前记录
                                this.processedBlocks.delete(blockId);
                            }
                        }
                    }
                }
            });

            observer.observe(block, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        stop() {
            if (this.mainObserver) {
                this.mainObserver.disconnect();
            }
            
            this.processedBlocks.clear();
            window.deepseekResponseCapturerRunning = false;
            console.log('监听器已卸载');
        }
    }

    // 立即初始化
    const capturer = new DeepSeekResponseCapturer();
    capturer.start();
    
    // 添加全局方法，方便调试
    window.deepseekCapturer = capturer;
})();