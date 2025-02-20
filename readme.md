# New Tab Background Generator

This project is a web application that allows users to generate and set a custom background image for a new browser tab. The application provides a user-friendly interface for uploading an image, generating a stylized background, and setting it as the background for the new tab.

## Features

- **Image Upload**: Users can upload an image to be used as a style reference.
- **Background Generation**: The application generates a stylized background image based on the uploaded image.
- **Preview and Selection**: Users can preview the generated images and select one to set as the background.
- **Local Storage**: The selected background image is saved in the browser's local storage and applied as the background for the new tab.

## Technologies Used

- **HTML**: Structure of the web application.
- **CSS**: Styling of the web application.
- **JavaScript**: Functionality and interactivity of the web application.
- **Bootstrap**: Responsive design and UI components.
- **jQuery**: Simplified DOM manipulation and event handling.

## File Structure

- `newtab.html`: The main HTML file that contains the structure of the web application.
- `css/style.css`: The CSS file that contains the styles for the web application.
- `js/main.js`: The JavaScript file that contains the functionality and interactivity of the web application.
- `workflow/Win11-stylized-wallpaper.json`: The JSON file that defines the workflow for generating the stylized background.

## How to Use

1. **Open the Application**: Open the `newtab.html` file in a web browser.
2. **Upload an Image**: Click on the "Generate Background" button to open the right pane. In the "File Upload Area", drag and drop an image or click to select a file from your computer.
3. **Generate Background**: Click the "Generate" button to start the background generation process. The file upload area will collapse, and the generated grid area will expand to show the preview of the generated images.
4. **Select and Set Background**: Click on a generated image to select it. The selected image will be highlighted. Click the "Set as new tab background" button to save the selected image in local storage and set it as the background for the new tab.

## Code Overview

### HTML
The `newtab.html` file contains the structure of the web application, including the right pane for image upload and background generation.

### CSS
The `css/style.css` file contains the styles for the web application, including the styles for the right pane and the generated grid.

### JavaScript
The `js/main.js` file contains the functionality and interactivity of the web application, including the logic for the right pane and the generated grid.

### Workflow JSON
The `workflow/Win11-stylized-wallpaper.json` file defines the workflow for generating the stylized background.
