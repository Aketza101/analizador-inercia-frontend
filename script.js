document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const imageUrlInput = document.getElementById('imageUrl');
    const statusMessage = document.getElementById('statusMessage');
    const resultsSection = document.getElementById('resultsSection');
    const sourceImage = document.getElementById('sourceImage');
    const heatmapOverlay = document.getElementById('heatmapOverlay');
    const imageWrapper = document.getElementById('imageWrapper');

    let heatmapInstance = null;

    analyzeBtn.addEventListener('click', async () => {
        const imageUrl = imageUrlInput.value.trim();
        if (!imageUrl) {
            showStatus('Por favor, ingresa una URL de imagen.', true);
            return;
        }

        // Reset state
        showStatus('Analizando... Esto puede tardar unos segundos.', false);
        resultsSection.classList.add('hidden');
        analyzeBtn.disabled = true;

        try {
            // 1. Send Request to API
            const response = await fetch('https://analizador-inercia-backend.onrender.com/analizar-inercia', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image_url: imageUrl })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error en el servidor.');
            }

            const data = await response.json();
            const heatmapMatrix = data.heatmap_data; // 2D Array

            // 2. Load Image to DOM
            // We set the src to the proxy or original URL. 
            // Note: If CORS on the image itself prevents loading, we might have issues with `heatmap.js` if it used canvas.getImageData, 
            // but `heatmap.js` overlays ON TOP, so basic <img> display is fine.
            sourceImage.crossOrigin = "Anonymous";
            sourceImage.onload = () => {
                resultsSection.classList.remove('hidden');

                // 3. Initialize/Update Heatmap
                // We must match the overlay dimensions to the rendered image dimensions
                // The API returns data resized to *original* image size.
                // But the browser might scale the image (CSS `max-width: 100%`).
                // We need to map the data points to the *visual* size or force the heatmap to match.

                const displayWidth = sourceImage.width;
                const displayHeight = sourceImage.height;
                const naturalWidth = sourceImage.naturalWidth;
                const naturalHeight = sourceImage.naturalHeight;

                // Configure Heatmap
                // Clear previous instance if any
                heatmapOverlay.innerHTML = '';

                heatmapInstance = h337.create({
                    container: heatmapOverlay,
                    radius: 20, // Adjust radius based on size?
                    maxOpacity: 0.6,
                    minOpacity: 0,
                    blur: 0.75
                });

                // 4. Process Data
                // The API returns data for the *natural* size.
                // We need to scale points if the image is displayed smaller.
                const scaleX = displayWidth / naturalWidth;
                const scaleY = displayHeight / naturalHeight;

                const points = [];
                // Optimization: Sample 1 out of every N pixels if image is huge
                // For 320x240 (76k) it's okay. For 4000x3000 (12M), it will crash.
                // Limit total points to approx 10,000 for performance

                const totalPixels = heatmapMatrix.length * heatmapMatrix[0].length;
                const step = Math.ceil(Math.sqrt(totalPixels / 5000)); // Dynamic step

                // Find max value for normalization reference (should be 255 usually)
                // We invert: 255 (High Saliency) -> 0 (Low Inertia).
                // Wait, User wants "Visualize Inertia (Low Saliency)".
                // So if Saliency is Low (0), Inertia is High. 
                // We want High Heat for Low Saliency.
                // Value = 255 - InputValue.

                for (let y = 0; y < heatmapMatrix.length; y += step) {
                    for (let x = 0; x < heatmapMatrix[y].length; x += step) {
                        const originalVal = heatmapMatrix[y][x];
                        // High Inertia = Low Saliency
                        // If Saliency is 0 (Low), val should be 255 (High Heat)
                        // If Saliency is 255 (High), val should be 0 (Low Heat)
                        const val = 255 - originalVal;

                        // Only add points with some heat to save DOM
                        if (val > 10) {
                            points.push({
                                x: Math.floor(x * scaleX),
                                y: Math.floor(y * scaleY),
                                value: val
                            });
                        }
                    }
                }

                heatmapInstance.setData({
                    max: 255,
                    min: 0,
                    data: points
                });

                showStatus('Análisis completado.', false);
                analyzeBtn.disabled = false;
            };

            sourceImage.onerror = () => {
                showStatus('Error al cargar la imagen visualmente. Verifica que la URL sea accesible.', true);
                analyzeBtn.disabled = false;
            };

            // Trigger load (cache bust to be safe?)
            sourceImage.src = imageUrl;

        } catch (error) {
            console.error(error);
            showStatus("Error: " + error.message, true);
            analyzeBtn.disabled = false;
        }
    });

    function showStatus(msg, isError) {
        statusMessage.textContent = msg;
        statusMessage.style.color = isError ? '#e74c3c' : '#27ae60';
    }
});

