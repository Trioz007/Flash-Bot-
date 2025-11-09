const typingForm = document.querySelector(".typing-form");
const chatContainer = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion");
const toggleThemeButton = document.querySelector("#theme-toggle-button");
const deleteChatButton = document.querySelector("#delete-chat-button");

// State variables
let userMessage = null;
let isResponseGenerating = false;
let chatHistory = [];

// API configuration for Gemini 2.0 Flash
const API_KEY = "PASTE YOUR API KEY";
const BASE_URL = `https://generativelanguage.googleapis.com/v1`;

// Use Gemini 2.0 Flash model - latest and fastest model
const CURRENT_MODEL = "gemini-2.0-flash-exp";

// Alternative models to try if the primary one fails
const ALTERNATIVE_MODELS = [
    "gemini-2.0-flash-exp", // Latest experimental version
    "gemini-2.0-flash",     // Stable version when available
    "gemini-1.5-flash",     // Fallback to 1.5 flash
    "gemini-1.5-pro",       // Fallback to 1.5 pro
    "gemini-1.0-pro"        // Original fallback
];

// Load theme and chat data from local storage on page load
const loadDataFromLocalstorage = () => {
    const savedChats = localStorage.getItem("saved-chats");
    const isLightMode = (localStorage.getItem("themeColor") === "light_mode");
    const savedHistory = localStorage.getItem("chat-history");

    document.body.classList.toggle("light_mode", isLightMode);
    toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";

    chatContainer.innerHTML = savedChats || '';
    
    if (savedChats && savedChats.trim() !== '') {
        document.body.classList.add("hide-header");
    }

    // Load chat history for context
    if (savedHistory) {
        try {
            chatHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error("Error loading chat history:", e);
            chatHistory = [];
        }
    }

    if (chatContainer.scrollHeight > 0) {
        chatContainer.scrollTo(0, chatContainer.scrollHeight);
    }
}

// Create a new message element and return it
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
}

// Show typing effect by displaying words one by one
const showTypingEffect = (text, textElement, incomingMessageDiv) => {
    // Clear the text element first
    textElement.innerHTML = '';
    
    let currentIndex = 0;
    const typingSpeed = 20; // Faster typing for flash model

    const typeCharacter = () => {
        if (currentIndex < text.length) {
            // Add next character
            textElement.innerHTML += text.charAt(currentIndex);
            currentIndex++;
            
            // Hide loading indicator when we start typing
            const loadingIndicator = incomingMessageDiv.querySelector(".loading-indicator");
            if (loadingIndicator && currentIndex === 1) {
                loadingIndicator.style.display = "none";
            }
            
            chatContainer.scrollTo(0, chatContainer.scrollHeight);
            setTimeout(typeCharacter, typingSpeed);
        } else {
            // Typing complete
            isResponseGenerating = false;
            
            const copyIcon = incomingMessageDiv.querySelector(".icon");
            if (copyIcon) {
                copyIcon.classList.remove("hide");
            }
            
            // Save chats to local storage
            localStorage.setItem("saved-chats", chatContainer.innerHTML);
        }
    };

    typeCharacter();
}

// Fetch response from Gemini 2.0 Flash API - FIXED: Correct content structure
const generateAPIResponse = async (incomingMessageDiv, modelToUse = CURRENT_MODEL) => {
    const textElement = incomingMessageDiv.querySelector(".text");

    try {
        const API_URL = `${BASE_URL}/models/${modelToUse}:generateContent?key=${API_KEY}`;
        
        // FIXED: Build contents array with proper structure
        // For Gemini API, we only include user and model messages in the contents array
        const contents = [
            // System instruction as the first user message
            {
                role: "user",
                parts: [{
                    text: "You are a helpful and friendly AI assistant. Provide clear, concise, and accurate responses. Use appropriate formatting but avoid markdown."
                }]
            },
            {
                role: "model", 
                parts: [{
                    text: "Understood! I'll provide helpful, friendly, and accurate responses with clear formatting when appropriate."
                }]
            },
            // Add chat history
            ...chatHistory,
            // Current user message
            {
                role: "user",
                parts: [{
                    text: userMessage
                }]
            }
        ];

        const requestBody = {
            contents: contents,
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048, // Increased for longer responses
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        console.log("Using model:", modelToUse);
        console.log("Sending request to Gemini 2.0 Flash...");

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        
        console.log("API Response:", data);
        
        if (!response.ok) {
            // If model is not found, try alternative models
            if (data.error?.message?.includes('not found') || data.error?.message?.includes('not supported')) {
                const currentIndex = ALTERNATIVE_MODELS.indexOf(modelToUse);
                if (currentIndex < ALTERNATIVE_MODELS.length - 1) {
                    const nextModel = ALTERNATIVE_MODELS[currentIndex + 1];
                    console.log(`Trying alternative model: ${nextModel}`);
                    return generateAPIResponse(incomingMessageDiv, nextModel);
                }
            }
            throw new Error(data.error?.message || `HTTP error! status: ${response.status}`);
        }

        if (!data.candidates || 
            !data.candidates[0] || 
            !data.candidates[0].content || 
            !data.candidates[0].content.parts || 
            !data.candidates[0].content.parts[0]) {
            throw new Error("Invalid response format from API");
        }

        const apiResponse = data.candidates[0].content.parts[0].text;
        
        // Add to chat history for context - FIXED: Proper role assignment
        chatHistory.push(
            { 
                role: "user",
                parts: [{ text: userMessage }] 
            },
            { 
                role: "model",
                parts: [{ text: apiResponse }] 
            }
        );
        
        // Keep only last 10 exchanges (20 messages) to avoid token limits
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(-20);
        }
        
        // Save chat history
        localStorage.setItem("chat-history", JSON.stringify(chatHistory));
        
        // Show the response with typing effect
        showTypingEffect(apiResponse, textElement, incomingMessageDiv);
        
    } catch (error) {
        console.error("API Error:", error);
        isResponseGenerating = false;
        textElement.innerText = `Error: ${error.message}. Please try again.`;
        textElement.parentElement.closest(".message").classList.add("error");
        
        const loadingIndicator = incomingMessageDiv.querySelector(".loading-indicator");
        if (loadingIndicator) {
            loadingIndicator.style.display = "none";
        }
        
        const copyIcon = incomingMessageDiv.querySelector(".icon");
        if (copyIcon) {
            copyIcon.classList.remove("hide");
        }
    } finally {
        incomingMessageDiv.classList.remove("loading");
    }
}

// Show loading animation
const showLoadingAnimation = () => {
    const html = `<div class="message-content">
                    <img class="avatar" src="/downloads.png" alt="Gemini avatar">
                    <p class="text"></p>
                    <div class="loading-indicator">
                        <div class="loading-bar"></div>
                        <div class="loading-bar"></div>
                        <div class="loading-bar"></div>
                    </div>
                </div>
                <span onClick="copyMessage(this)" class="icon material-symbols-rounded hide">content_copy</span>`;

    const incomingMessageDiv = createMessageElement(html, "incoming", "loading");
    chatContainer.appendChild(incomingMessageDiv);

    chatContainer.scrollTo(0, chatContainer.scrollHeight);
    generateAPIResponse(incomingMessageDiv);
}

// Copy message text to clipboard
const copyMessage = (copyButton) => {
    const messageText = copyButton.parentElement.querySelector(".text").innerText;

    navigator.clipboard.writeText(messageMessageText).then(() => {
        copyButton.innerText = "done";
        setTimeout(() => copyButton.innerText = "content_copy", 1000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

// Handle outgoing chat messages
const handleOutgoingChat = () => {
    const typingInput = typingForm.querySelector(".typing-input");
    userMessage = typingInput.value.trim();
    
    if(!userMessage || isResponseGenerating) return;

    isResponseGenerating = true;

    const html = `<div class="message-content">
                    <img class="avatar" src="/download.png" alt="User avatar">
                    <p class="text">${userMessage}</p>
                </div>`;

    const outgoingMessageDiv = createMessageElement(html, "outgoing");
    chatContainer.appendChild(outgoingMessageDiv);
    
    typingInput.value = '';
    document.body.classList.add("hide-header");
    chatContainer.scrollTo(0, chatContainer.scrollHeight);
    setTimeout(showLoadingAnimation, 500);
}

// Test model availability
const testModelAvailability = async () => {
    for (const model of ALTERNATIVE_MODELS) {
        try {
            const testUrl = `${BASE_URL}/models/${model}?key=${API_KEY}`;
            const response = await fetch(testUrl);
            if (response.ok) {
                console.log(`✓ Model available: ${model}`);
                return model;
            }
        } catch (error) {
            console.log(`✗ Model not available: ${model}`);
        }
    }
    return null;
}

// Clear chat history
const clearChatHistory = () => {
    chatHistory = [];
    localStorage.removeItem("chat-history");
    localStorage.removeItem("saved-chats");
    chatContainer.innerHTML = '';
    document.body.classList.remove("hide-header");
}

// Event listeners
toggleThemeButton.addEventListener("click", () => {
    const isLightMode = document.body.classList.toggle("light_mode");
    localStorage.setItem("themeColor", isLightMode ? "light_mode" : "dark_mode");
    toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
});

deleteChatButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all the chats?")) {
        clearChatHistory();
        location.reload();
    }
});

suggestions.forEach(suggestion => {
    suggestion.addEventListener("click", () => {
        userMessage = suggestion.querySelector(".text").innerText;
        handleOutgoingChat();
    });
});

typingForm.addEventListener("submit", (e) => {
    e.preventDefault(); 
    handleOutgoingChat();
});

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    loadDataFromLocalstorage();
    
    // Test which model is available
    const availableModel = await testModelAvailability();
    if (availableModel) {
        console.log("Using model:", availableModel);
    } else {
        console.error("No Gemini models available. Please check your API key and region.");
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = 'Gemini API is not available. Please check your API key and ensure Gemini API is enabled in Google AI Studio.';
        errorDiv.style.cssText = 'background: #ffebee; color: #c62828; padding: 15px; margin: 10px; border-radius: 8px; border: 1px solid #ffcdd2;';
        document.body.prepend(errorDiv);
    }
});

// Export functions for global access
window.copyMessage = copyMessage;

window.clearChatHistory = clearChatHistory;
