document.addEventListener("DOMContentLoaded", () => {
  // If a background image is saved in local storage, use it.
  const savedBackground = localStorage.getItem("backgroundImage");
  if (savedBackground) {
    document.body.style.backgroundImage = `url(${savedBackground})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
  }

  const dropArea = document.getElementById("node169DropArea");
  const fileInput = document.getElementById("node169UploadInput");
  const node169Preview = document.getElementById("node169Preview");
  const generateButton = document.getElementById("generateBackgroundButton");
  const progressDiv = document.getElementById("progress");
  const generatedGrid = document.getElementById("generatedGrid");
  const setBackgroundButton = document.getElementById("setBackgroundButton");
  
  let uploadedImageFilename = null;
  let selectedImageBase64 = null; // Base64 string of the selected image
  let promptId = null;
  let currentWorkflow = {};
  let isPolling = false;
  
  // Helper to convert blob to a base64 data URL.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  // Setup drag & drop & file selection.
  dropArea.addEventListener("click", () => fileInput.click());
  dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.style.borderColor = "#000";
  });
  dropArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropArea.style.borderColor = "#ccc";
  });
  dropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dropArea.style.borderColor = "#ccc";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });
  
  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      node169Preview.src = e.target.result;
      node169Preview.style.display = "block";
    };
    reader.readAsDataURL(file);
    uploadNode169Image(file);
  }
  
  async function uploadNode169Image(file) {
    progressDiv.textContent = "Uploading image for node 169...";
    const formData = new FormData();
    formData.append("image", file);
    try {
      const response = await fetch("http://127.0.0.1:8000/upload/image", {
        method: "POST",
        body: formData
      });
      if (!response.ok) throw new Error("Upload failed.");
      const data = await response.json();
      console.log(data);
      uploadedImageFilename = data.name;
      progressDiv.textContent = "Image uploaded successfully.";
    } catch (error) {
      console.error("Error uploading image:", error);
      progressDiv.textContent = "Error uploading image: " + error.message;
    }
  }
  
  // Trigger background generation when "Generate Background" is clicked.
  generateButton.addEventListener("click", () => {
    generateBackground();
  });
  
  async function generateBackground() {
    // Clear previous images and disable the background CTA.
    generatedGrid.innerHTML = "";
    setBackgroundButton.disabled = true;
    selectedImageBase64 = null;
    
    progressDiv.textContent = "Loading workflow...";
    try {
      const workflowResponse = await fetch("/workflow/Win11-stylized-wallpaper.json");
      if (!workflowResponse.ok) throw new Error("Failed to load workflow JSON.");
      let workflow = await workflowResponse.json();
      currentWorkflow = workflow;
      
      // Replace node 169's image input with the uploaded image filename, if available.
      if (uploadedImageFilename && workflow["169"] && workflow["169"].inputs) {
        workflow["169"].inputs.image = uploadedImageFilename;
      }
      
      progressDiv.textContent = "Workflow loaded. Starting background generation...";
      
      const clientId = (crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      // Open WebSocket connection for progress updates.
      const ws = new WebSocket(`ws://127.0.0.1:8000/ws?clientId=${clientId}`);
      ws.onmessage = async function (event) {
        try {
          const message = JSON.parse(event.data);
          console.log("WebSocket message:", message);
          if (message.type === "progress") {
            progressDiv.textContent = `Progress: ${message.data.value} / ${message.data.max}`;
          } else if (message.type === "executing") {
            progressDiv.textContent = `Executing node: ${message.data.node}`;
          } else if (message.type === "execution_cached") {
            progressDiv.textContent = `Cached execution: ${JSON.stringify(message.data)}`;
          } else if (message.type === "executed" && message.data.prompt_id === promptId) {
            const nodeId = message.data.node;
            // Only consider nodes whose workflow definition is of class_type PreviewImage.
            if (currentWorkflow[nodeId] && currentWorkflow[nodeId].class_type === "PreviewImage") {
              progressDiv.textContent = `Preview node (${nodeId}) executed. Checking for generated images...`;
              if (!isPolling) {
                pollForPreview();
              }
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };
      
      // Send the modified workflow JSON to the ComfyUI server.
      const response = await fetch("http://127.0.0.1:8000/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });
      if (!response.ok) {
        const errorText = await response.text();
        progressDiv.textContent = "Error sending prompt to server: " + errorText;
        throw new Error("Server error: " + errorText);
      }
      const data = await response.json();
      promptId = data.prompt_id;
      console.log("Prompt ID:", promptId);
    } catch (error) {
      console.error("Error during background generation:", error);
      progressDiv.textContent = "Error: " + error.message;
    }
  }
  
  // Poll the history endpoint for nodes whose class_type is PreviewImage.
  async function pollForPreview() {
    isPolling = true;
    const maxAttempts = 20;
    let attempts = 0;
    const pollInterval = 1000;
    const poll = async () => {
      attempts++;
      try {
        const historyResponse = await fetch(`http://127.0.0.1:8000/history/${promptId}`);
        if (!historyResponse.ok) throw new Error("Failed to fetch history.");
        const historyData = await historyResponse.json();
        let allImages = [];
        const outputs = historyData[promptId]?.outputs;
        if (outputs) {
          for (const nodeId in outputs) {
            if (currentWorkflow[nodeId] && currentWorkflow[nodeId].class_type === "PreviewImage") {
              const nodeOutput = outputs[nodeId];
              if (nodeOutput.images && nodeOutput.images.length > 0) {
                allImages = allImages.concat(nodeOutput.images);
              }
            }
          }
          // Remove duplicates.
          const uniqueImages = [];
          const seen = new Set();
          allImages.forEach(img => {
            const key = img.filename + "_" + img.subfolder;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueImages.push(img);
            }
          });
          if (uniqueImages.length > 0) {
            progressDiv.textContent = "Generation completed. Preview images available.";
            displayImages(uniqueImages);
            isPolling = false;
            return;
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        progressDiv.textContent = "Timeout waiting for preview images.";
        isPolling = false;
      }
    };
    poll();
  }
  
  // Display images in the grid by converting blobs to base64.
  function displayImages(images) {
    generatedGrid.innerHTML = "";
    images.forEach(async (imageInfo) => {
      const viewUrl = `http://127.0.0.1:8000/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${encodeURIComponent(imageInfo.type)}`;
      try {
        const imageResponse = await fetch(viewUrl);
        const blob = await imageResponse.blob();
        const base64Data = await blobToBase64(blob);
        const imgElem = document.createElement("img");
        imgElem.src = base64Data;
        // Store the base64 string in a dataset attribute.
        imgElem.dataset.base64 = base64Data;
        imgElem.addEventListener("click", () => {
          Array.from(generatedGrid.getElementsByTagName("img")).forEach(img => {
            img.classList.remove("selected");
          });
          imgElem.classList.add("selected");
          selectedImageBase64 = imgElem.dataset.base64;
          setBackgroundButton.disabled = false;
        });
        generatedGrid.appendChild(imgElem);
      } catch (err) {
        console.error("Error fetching image:", err);
      }
    });
  }
  
  // Save the selected image in local storage and set it as the background.
  setBackgroundButton.addEventListener("click", () => {
    if (selectedImageBase64) {
      localStorage.setItem("backgroundImage", selectedImageBase64);
      document.body.style.backgroundImage = `url(${selectedImageBase64})`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      progressDiv.textContent = "Background image saved to local storage.";
    }
  });
});
