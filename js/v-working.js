document.addEventListener("DOMContentLoaded", () => {
    const dropArea = document.getElementById("node169DropArea");
    const fileInput = document.getElementById("node169UploadInput");
    const node169Preview = document.getElementById("node169Preview");
    const generateButton = document.getElementById("generateBackgroundButton");
    const progressDiv = document.getElementById("progress");
    const generatedGrid = document.getElementById("generatedGrid");
    const setBackgroundButton = document.getElementById("setBackgroundButton");
    
    let uploadedImageFilename = null; // Stores the filename after upload for node 169
    let selectedImageUrl = null; // Stores the URL of the selected generated image
  
    // Setup drag and drop & click to upload for node 169
    dropArea.addEventListener("click", () => {
      fileInput.click();
    });
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
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFile(fileInput.files[0]);
      }
    });
    
    function handleFile(file) {
      // Show preview of the image
      const reader = new FileReader();
      reader.onload = function(e) {
        node169Preview.src = e.target.result;
        node169Preview.style.display = "block";
      };
      reader.readAsDataURL(file);
      
      // Upload file to ComfyUI using its API
      uploadNode169Image(file);
    }
    
    async function uploadNode169Image(file) {
      progressDiv.textContent = "Uploading image for node 169...";
      const formData = new FormData();
      // IMPORTANT: Use "image" as the key per ComfyUI server's expected parameter name.
      formData.append("image", file);
      try {
        const response = await fetch("http://127.0.0.1:8000/upload/image", {
          method: "POST",
          body: formData
        });
        if (!response.ok) throw new Error("Upload failed.");
        const data = await response.json();
        // Expecting the API returns an object like { filename: "uploadedFilename.jpg" }
        uploadedImageFilename = data.filename;
        progressDiv.textContent = "Image uploaded successfully.";
      } catch (error) {
        console.error("Error uploading image:", error);
        progressDiv.textContent = "Error uploading image: " + error.message;
      }
    }
    
    // Trigger background generation on button click
    generateButton.addEventListener("click", () => {
      generateBackground();
    });
    
    async function generateBackground() {
      // Clear previous images and disable background CTA until a selection is made.
      generatedGrid.innerHTML = "";
      setBackgroundButton.disabled = true;
      selectedImageUrl = null;
    
      // Load the new workflow JSON file
      progressDiv.textContent = "Loading workflow...";
      try {
        const workflowResponse = await fetch("/workflow/Win11-stylized-wallpaper.json");
        if (!workflowResponse.ok) throw new Error("Failed to load workflow JSON.");
        let workflow = await workflowResponse.json();
        
        // Replace node 169's image input with the uploaded image filename, if available
        if (uploadedImageFilename && workflow["169"] && workflow["169"].inputs) {
          workflow["169"].inputs.image = uploadedImageFilename;
        }
        
        progressDiv.textContent = "Workflow loaded. Starting background generation...";
        
        // Generate a unique client ID.
        const clientId = (crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        let promptId = null;
        
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
              progressDiv.textContent = "Generation completed.";
              // Fetch history to get details of the generated images.
              try {
                const historyResponse = await fetch(`http://127.0.0.1:8000/history/${promptId}`);
                const historyData = await historyResponse.json();
                // Look for a node output with a batch of 4 images.
                let images = [];
                for (const nodeId in historyData[promptId].outputs) {
                  const nodeOutput = historyData[promptId].outputs[nodeId];
                  if (nodeOutput.images && nodeOutput.images.length === 4) {
                    images = nodeOutput.images;
                    break;
                  }
                }
                if (images.length === 0) {
                  progressDiv.textContent = "No batch images found in the output.";
                  return;
                }
                // Display the images in a 2x2 grid.
                generatedGrid.innerHTML = "";
                images.forEach(async (imageInfo) => {
                  const viewUrl = `http://127.0.0.1:8000/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${encodeURIComponent(imageInfo.type)}`;
                  try {
                    const imageResponse = await fetch(viewUrl);
                    const blob = await imageResponse.blob();
                    const imageUrl = URL.createObjectURL(blob);
                    const imgElem = document.createElement("img");
                    imgElem.src = imageUrl;
                    imgElem.dataset.imageUrl = imageUrl;
                    imgElem.addEventListener("click", () => {
                      // Deselect any previously selected images.
                      Array.from(generatedGrid.getElementsByTagName("img")).forEach(img => {
                        img.classList.remove("selected");
                      });
                      imgElem.classList.add("selected");
                      selectedImageUrl = imageUrl;
                      setBackgroundButton.disabled = false;
                    });
                    generatedGrid.appendChild(imgElem);
                  } catch (err) {
                    console.error("Error fetching image:", err);
                  }
                });
              } catch (error) {
                console.error("Error fetching history or images:", error);
                progressDiv.textContent = "Error retrieving generated images.";
              }
              ws.close();
            }
          } catch (error) {
            console.error("Error processing WebSocket message:", error);
          }
        };
        
        // Send the modified workflow JSON to the ComfyUI server via POST /prompt.
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
    
    // When the user clicks the CTA button, set the selected image as the background
    setBackgroundButton.addEventListener("click", () => {
      if (selectedImageUrl) {
        document.body.style.backgroundImage = `url(${selectedImageUrl})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        
        // Save the background image in the images folder via the ComfyUI API.
        // Here we simulate a call to an endpoint (e.g., POST /saveBackground) that saves the image.
        fetch("http://127.0.0.1:8000/saveBackground", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ imageUrl: selectedImageUrl })
        }).then(response => {
          if (response.ok) {
            progressDiv.textContent = "Background image saved successfully.";
          } else {
            progressDiv.textContent = "Failed to save background image.";
          }
        }).catch(err => {
          console.error("Error saving background image:", err);
          progressDiv.textContent = "Error saving background image.";
        });
      }
    });
  });
  