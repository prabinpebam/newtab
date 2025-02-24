// --- Now, the DOMContentLoaded block that uses NoiseAnimation ---
document.addEventListener("DOMContentLoaded", () => {
  // If a background image is saved in local storage, use it.
  const savedBackground = localStorage.getItem("backgroundImage");
  if (savedBackground) {
    document.body.style.backgroundImage = `url(${savedBackground})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
  }

  // Global variables
  const progressDiv = document.getElementById("progress");
  const generatedGrid = document.getElementById("generatedGrid");
  const rightPane = document.getElementById("rightPane");
  const generateButton = document.getElementById("generateBackgroundButton");
  const closePaneButton = document.getElementById("closePaneButton");
  const startGenerationButton = document.getElementById("startGenerationButton");
  const noiseCanvas = document.getElementById("noiseCanvas");
  const editableFieldsContainer = document.getElementById("editableFieldsContainer");

  let currentWorkflow = {};
  let selectedImageBase64 = null;
  let isPolling = false;
  
  // Initialize noise animation
  const noiseAnim = new NoiseAnimation(noiseCanvas);
  noiseAnim.stop();
  noiseCanvas.style.display = "none";

  // Object to store user-provided values from editable parameters
  const userEditableValues = {};

  // Function to load user editable parameters and dynamically create form fields
  async function loadUserEditableParameters() {
    try {
      const response = await fetch("/workflow/Win11-stylized-wallpaper/Win11-stylized-wallpaper-user-editable-parameters.json");
      if (!response.ok) throw new Error("Failed to load user editable parameters.");
      const paramsJson = await response.json();
      // Iterate over each node in the parameters JSON
      for (const nodeId in paramsJson) {
        if (!paramsJson.hasOwnProperty(nodeId)) continue;
        // Initialize storage for this node
        userEditableValues[nodeId] = {};
        const nodeData = paramsJson[nodeId];
        // Create a container for this node's fields
        // (Removed the node title as per requirements)
        const nodeContainer = document.createElement("div");
        nodeContainer.classList.add("mb-3");
        // Iterate over each input in the node
        for (const inputKey in nodeData.inputs) {
          if (!nodeData.inputs.hasOwnProperty(inputKey)) continue;
          const inputData = nodeData.inputs[inputKey];
          // Create a form group
          const formGroup = document.createElement("div");
          formGroup.classList.add("form-group");
          // Create a label using the input's label as primary identifier
          const label = document.createElement("label");
          label.textContent = inputData.label || inputKey;
          formGroup.appendChild(label);
          // Create input based on selectedType
          if (inputData.selectedType === "Image") {
            // Create a unique field ID using nodeId and a slugified version of the label
            function slugify(text) {
              return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
            }
            const fieldId = `editable-${nodeId}-${slugify(inputData.label)}`;
            
            // Create a drop area with updated styles and structure.
            const dropArea = document.createElement("div");
            dropArea.classList.add("p-3", "text-center");
            dropArea.style.cursor = "pointer";
            dropArea.style.position = "relative";
            dropArea.style.height = "350px";
            dropArea.style.maxHeight = "350px";
            dropArea.style.border = "2px dashed #ccc";
            dropArea.style.borderRadius = "20px";
            dropArea.id = `dropArea-${fieldId}`;
            
            // Create an instructional overlay that is absolutely positioned
            const instruction = document.createElement("div");
            instruction.style.position = "absolute";
            instruction.style.top = "0";
            instruction.style.left = "0";
            instruction.style.width = "100%";
            instruction.style.height = "100%";
            instruction.style.display = "flex";
            instruction.style.alignItems = "center";
            instruction.style.justifyContent = "center";
            instruction.style.pointerEvents = "none";
            instruction.style.color = "#888";
            instruction.textContent = "Drop an image or click to select a file.";
            dropArea.appendChild(instruction);
            
            // Create an img element for preview, center aligned
            const previewImg = document.createElement("img");
            previewImg.style.maxWidth = "100%";
            previewImg.style.maxHeight = "100%";
            previewImg.style.display = "none";
            previewImg.style.objectFit = "contain";
            previewImg.style.position = "relative";
            previewImg.style.zIndex = "1";
            previewImg.style.margin = "0 auto";
            previewImg.id = `preview-${fieldId}`;
            dropArea.appendChild(previewImg);
            
            // Create a hidden file input
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = "image/*";
            fileInput.style.display = "none";
            fileInput.id = `fileInput-${fieldId}`;
            formGroup.appendChild(dropArea);
            formGroup.appendChild(fileInput);
            
            // Event listeners for drag and drop and click-to-upload
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
                handleEditableFile(e.dataTransfer.files[0], nodeId, inputKey, fieldId);
              }
            });
            fileInput.addEventListener("change", () => {
              if (fileInput.files && fileInput.files[0]) {
                handleEditableFile(fileInput.files[0], nodeId, inputKey, fieldId);
              }
            });
          } else if (inputData.selectedType === "Number") {
            const numberInput = document.createElement("input");
            numberInput.type = "number";
            numberInput.classList.add("form-control");
            numberInput.value = inputData.value;
            numberInput.addEventListener("change", () => {
              userEditableValues[nodeId][inputKey] = numberInput.value;
            });
            formGroup.appendChild(numberInput);
            // Initialize with default value
            userEditableValues[nodeId][inputKey] = inputData.value;
          } else if (inputData.selectedType === "Text" || inputData.selectedType === "String") {
            const textarea = document.createElement("textarea");
            textarea.classList.add("form-control");
            textarea.rows = 3;
            textarea.value = inputData.value;
            textarea.addEventListener("change", () => {
              userEditableValues[nodeId][inputKey] = textarea.value;
            });
            formGroup.appendChild(textarea);
            // Initialize with default value
            userEditableValues[nodeId][inputKey] = inputData.value;
          }
          nodeContainer.appendChild(formGroup);
        }
        editableFieldsContainer.appendChild(nodeContainer);
      }
    } catch (error) {
      console.error("Error loading user editable parameters:", error);
      progressDiv.textContent = "Error loading editable parameters: " + error.message;
    }
  }

  // Function to handle file upload for editable image fields
  async function handleEditableFile(file, nodeId, inputKey, fieldId) {
    const previewImg = document.getElementById(`preview-${fieldId}`);
    const fileInput = document.getElementById(`fileInput-${fieldId}`);
    const dropArea = document.getElementById(`dropArea-${fieldId}`);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.style.display = "block";
    };
    reader.readAsDataURL(file);
    
    progressDiv.textContent = `Uploading image for ${nodeId} - ${inputKey}...`;
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
      // Save the uploaded filename
      userEditableValues[nodeId][inputKey] = data.name;
      progressDiv.textContent = "Image uploaded successfully.";
    } catch (error) {
      console.error("Error uploading image:", error);
      progressDiv.textContent = "Error uploading image: " + error.message;
    }
  }
  
  // Load the editable parameters on page load
  loadUserEditableParameters();
  
  // UI control event listeners
  generateButton.addEventListener("click", () => {
    rightPane.classList.add("show");
  });
  
  closePaneButton.addEventListener("click", () => {
    rightPane.classList.remove("show");
  });
  
  startGenerationButton.addEventListener("click", () => {
    generateBackground();
    $('#collapseTwo').collapse('show');
  });
  
  // Update the workflow JSON with user provided values
  function updateWorkflowWithUserValues(workflow) {
    for (const nodeId in userEditableValues) {
      if (userEditableValues.hasOwnProperty(nodeId)) {
        if (workflow[nodeId] && workflow[nodeId].inputs) {
          for (const inputKey in userEditableValues[nodeId]) {
            if (userEditableValues[nodeId].hasOwnProperty(inputKey)) {
              workflow[nodeId].inputs[inputKey] = userEditableValues[nodeId][inputKey];
            }
          }
        }
      }
    }
    return workflow;
  }
  
  // Helper to convert blob to a base64 data URL.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  // Single generateBackground function
  async function generateBackground() {
    // When generation starts, hide any generated images.
    let imagesContainer = document.getElementById("imagesContainer");
    if (!imagesContainer) {
      imagesContainer = document.createElement("div");
      imagesContainer.id = "imagesContainer";
      generatedGrid.appendChild(imagesContainer);
    }
    imagesContainer.style.display = "none";
  
    // Ensure noiseCanvas is visible and start noise animation.
    noiseCanvas.style.display = "block";
    noiseAnim.start();
  
    progressDiv.textContent = "Loading workflow...";
    try {
      const workflowResponse = await fetch("/workflow/Win11-stylized-wallpaper/Win11-stylized-wallpaper.json");
      if (!workflowResponse.ok) throw new Error("Failed to load workflow JSON.");
      let workflow = await workflowResponse.json();
      // Save workflow for use in polling later, updating with user provided values
      currentWorkflow = updateWorkflowWithUserValues(workflow);
  
      progressDiv.textContent = "Workflow loaded. Starting background generation...";
  
      const clientId = (crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);
  
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
            // Only consider nodes with PreviewImage class_type
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
  
      // Send the modified workflow JSON to the server.
      const response = await fetch("http://127.0.0.1:8000/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: currentWorkflow, client_id: clientId })
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
            noiseAnim.stop();
            noiseCanvas.style.display = "none";
  
            let imagesContainer = document.getElementById("imagesContainer");
            if (!imagesContainer) {
              imagesContainer = document.createElement("div");
              imagesContainer.id = "imagesContainer";
              generatedGrid.appendChild(imagesContainer);
            }
            imagesContainer.innerHTML = "";
            imagesContainer.style.display = "grid";
  
            displayImages(uniqueImages, imagesContainer);
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
  
  function displayImages(images, container) {
    images.forEach(async (imageInfo) => {
      const viewUrl = `http://127.0.0.1:8000/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${encodeURIComponent(imageInfo.type)}`;
      try {
        const imageResponse = await fetch(viewUrl);
        const blob = await imageResponse.blob();
        const base64Data = await blobToBase64(blob);
        const imgElem = document.createElement("img");
        imgElem.src = base64Data;
        imgElem.dataset.base64 = base64Data;
        imgElem.addEventListener("click", () => {
          Array.from(container.getElementsByTagName("img")).forEach(img => {
            img.classList.remove("selected");
          });
          imgElem.classList.add("selected");
          selectedImageBase64 = imgElem.dataset.base64;
          if (selectedImageBase64) {
            try {
              const previousImage = localStorage.getItem("backgroundImage");
              if (previousImage) {
                console.log("Removing previous background image from local storage.");
                localStorage.removeItem("backgroundImage");
              }
              localStorage.setItem("backgroundImage", selectedImageBase64);
              document.body.style.backgroundImage = `url(${selectedImageBase64})`;
              document.body.style.backgroundSize = "cover";
              document.body.style.backgroundPosition = "center";
              progressDiv.textContent = "Background image saved to local storage.";
              
              const storedImageSize = (selectedImageBase64.length * 2) / 1024;
              console.log(`Stored background image size: ${storedImageSize.toFixed(2)} KB`);
              
              let totalSize = 0;
              console.log("Current local storage items:");
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                const size = (value.length * 2) / 1024;
                totalSize += size;
                console.log(`- ${key}: ${size.toFixed(2)} KB`);
              }
              console.log(`Total local storage size: ${totalSize.toFixed(2)} KB`);
            } catch (e) {
              if (e.name === 'QuotaExceededError') {
                console.error("Local storage quota exceeded. Unable to save background image.");
                progressDiv.textContent = "Error: Local storage quota exceeded. Unable to save background image.";
              } else {
                console.error("Error saving background image:", e);
                progressDiv.textContent = "Error saving background image: " + e.message;
              }
            }
          }
        });
        container.appendChild(imgElem);
      } catch (err) {
        console.error("Error fetching image:", err);
      }
    });
  }
});
