// Load a background image dynamically from storage
chrome.storage.sync.get(["bgImage"], (result) => {
    if (result.bgImage) {
        document.body.style.backgroundImage = `url('${result.bgImage}')`;
    }
});
