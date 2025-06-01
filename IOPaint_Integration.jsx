// IOPaint Integration Script for Adobe Photoshop
// Target Application: Adobe Photoshop 2019+

// --- User Testing Notes ---
// 1. Ensure `json2.js` is in the same folder as this script.
// 2. Configure `IOPaintServerURL` below if your server is not at the default location.
// 3. Ensure your IOPaint server is running and accessible.
// 4. `curl` (macOS/Linux) or PowerShell `Invoke-WebRequest` (Windows) must be available in your system's PATH.
// 5. Test with various documents, layer types (art layers, layer sets), and selections.
// 6. Report any issues or suggestions for refinement.
// --- End User Testing Notes ---

// Ensure 'json2.js' is in the same folder as this script.
// It can be downloaded from: https://github.com/douglascrockford/JSON-js/blob/master/json2.js
#include "json2.js";

// --- Configuration ---
var IOPaintServerURL = "http://127.0.0.1:38080/api/v1/inpaint";
var PADDING_PIXELS = 128;
var TEMP_MARKING_LAYER_NAME = "IOPaint_Marks_Temp";
var RESULT_LAYER_NAME = "IOPaint Result";
var TEMP_PREFIX = "_IOPaint_Temp_";

// --- Globals ---
var mainWindow = null;
var sourceLayerDropdown = null;
var startMarkingButton = null;
var submitToIOPaintButton = null;

// --- Main Function ---
function main() {
    // New initial check for 'app' object and Photoshop context
    if (typeof app === "undefined" || app.name !== "Adobe Photoshop") {
        alert("Error: Script is not running in Adobe Photoshop or 'app' is undefined. Please run from Photoshop's File > Scripts menu.");
        return;
    }

    // Existing document check, now wrapped in try-catch
    try {
        if (!app.documents.length) {
            alert("No document open. Please open an image first.");
            return;
        }
    } catch (e) {
        alert("Error accessing app.documents: " + e + "\nThis can happen if the script is not run from within Photoshop or if there's an issue with the application object.");
        return;
    }

    // UI Implementation will go here (Step 2)
    createUI(); // This line should already exist

    // Populate dropdown (Step 3)
    populateLayersDropdown(); // This line should already exist
}

// --- UI Creation (Step 2) ---
function createUI() {
    if (mainWindow && mainWindow.visible) {
        mainWindow.close();
    }

    mainWindow = new Window("palette", "IOPaint Integration", undefined, { resizeable: true, closeButton: true });
    mainWindow.orientation = 'column';
    mainWindow.alignChildren = ['fill', 'top'];
    mainWindow.spacing = 10;
    mainWindow.margins = 15;

    // Source Selection Panel
    var sourcePanel = mainWindow.add("panel", undefined, "Source Selection");
    sourcePanel.alignChildren = ['fill', 'top'];
    sourcePanel.add("statictext", undefined, "Sample From:");
    sourceLayerDropdown = sourcePanel.add("dropdownlist", undefined, []);
    sourceLayerDropdown.alignment = ['fill', 'top'];

    // Actions Panel
    var actionsPanel = mainWindow.add("panel", undefined, "Actions");
    actionsPanel.alignChildren = ['fill', 'center'];
    startMarkingButton = actionsPanel.add("button", undefined, "Start Marking");
    startMarkingButton.onClick = onStartMarkingClick;

    submitToIOPaintButton = actionsPanel.add("button", undefined, "Submit to IOPaint");
    submitToIOPaintButton.onClick = onSubmitToIOPaintClick;
    submitToIOPaintButton.enabled = false;

    mainWindow.onClose = onPaletteClose;
    mainWindow.center();
    mainWindow.show();
}

// --- Layer Population (Step 3) ---
function populateLayersDropdown() {
    if (!mainWindow) return; // UI not created
    var doc = getActiveDoc();
    if (!doc) {
        // alert("No document found to populate layers."); // Optional: can be handled by main check
        return;
    }

    sourceLayerDropdown.removeAll();

    // Add special item for merged visible layers
    var mergedItem = sourceLayerDropdown.add("item", "All Visible Layers (Merged)");
    mergedItem.layerId = "_MERGED_"; // Store a special identifier

    function collectVisibleLayers(layers, prefix) {
        prefix = prefix || "";
        for (var i = 0; i < layers.length; i++) {
            var currentLayer = layers[i];
            if (currentLayer.visible) {
                if (currentLayer.typename === "ArtLayer") {
                    var item = sourceLayerDropdown.add("item", prefix + currentLayer.name);
                    item.layerId = currentLayer.id; // USE ID
                } else if (currentLayer.typename === "LayerSet") {
                    var setName = prefix + currentLayer.name + " (Folder)";
                    var item = sourceLayerDropdown.add("item", setName);
                    item.layerId = currentLayer.id; // USE ID
                    // To list layers within a folder:
                    // collectVisibleLayers(currentLayer.layers, "  " + prefix + currentLayer.name + " > ");
                }
            }
        }
    }

    collectVisibleLayers(doc.layers);

    if (sourceLayerDropdown.items.length > 0) {
        sourceLayerDropdown.selection = 0; // Select "All Visible Layers (Merged)" by default
    }
}

// --- "Start Marking" Logic (Step 4) ---
function onStartMarkingClick() {
    var doc = getActiveDoc();
    if (!doc) {
        alert("No active document.");
        return;
    }

    try {
        var existingTempLayer = doc.artLayers.getByName(TEMP_MARKING_LAYER_NAME);
        if (existingTempLayer) {
            existingTempLayer.remove();
        }
    } catch (e) { /* Layer didn't exist, ignore */ }

    var tempLayer = doc.artLayers.add();
    tempLayer.name = TEMP_MARKING_LAYER_NAME;
    tempLayer.blendMode = BlendMode.NORMAL;

    var selectedSourceItem = sourceLayerDropdown.selection;
    if (!selectedSourceItem) {
        alert("Please select a source from the dropdown.");
        tempLayer.remove(); // Clean up the just-added layer
        return;
    }
    var sourceLayerId = selectedSourceItem.layerId;

    if (sourceLayerId === "_MERGED_") {
        tempLayer.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
    } else {
        var referenceLayer = null;
        try {
            referenceLayer = findLayerById(doc, sourceLayerId);
            // findLayerByName was removed as findLayerById is superior and ID is now stored.
            // If you still need findLayerByName for some reason, it can be added back.

            if (referenceLayer) {
                tempLayer.move(referenceLayer, ElementPlacement.PLACEBEFORE);
            } else {
                tempLayer.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
                alert("Could not find the selected source layer (ID: " + sourceLayerId + "). Placing marks layer at the top.");
            }
        } catch (e) {
            // alert("Error finding source layer: " + e + ". Placing at top.");
            tempLayer.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
        }
    }

    doc.activeLayer = tempLayer;

    try {
        var idslct = charIDToTypeID( "slct" );
        var desc8 = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
        var ref4 = new ActionReference();
        var idPbTl = charIDToTypeID( "PbTl" ); // Paintbrush Tool
        ref4.putClass( idPbTl );
        desc8.putReference( idnull, ref4 );
        executeAction( idslct, desc8, DialogModes.NO );
    } catch (e) {
        // alert("Could not activate Brush Tool: " + e);
    }

    if (startMarkingButton) startMarkingButton.enabled = false;
    if (submitToIOPaintButton) submitToIOPaintButton.enabled = true;
}

// --- "Submit to IOPaint" Logic (Step 5) ---
function onSubmitToIOPaintClick() {
    var doc = getActiveDoc();
    if (!doc) {
        alert("No active document.");
        return;
    }

    var tempMarkingLayer;
    try {
        tempMarkingLayer = doc.artLayers.getByName(TEMP_MARKING_LAYER_NAME);
    } catch (e) {
        alert("Marking layer '" + TEMP_MARKING_LAYER_NAME + "' not found. Please use 'Start Marking' first.");
        resetUIForNewOperation();
        return;
    }

    // Ensure the marking layer's pixels are selected
    try {
        doc.activeLayer = tempMarkingLayer; // Make sure it's active for selection loading
        var idsetd = charIDToTypeID( "setd" );
        var desc1 = new ActionDescriptor();
        var idnull = charIDToTypeID( "null" );
        var ref1 = new ActionReference();
        var idChnl = charIDToTypeID( "Chnl" );
        var idfsel = charIDToTypeID( "fsel" );
        ref1.putProperty( idChnl, idfsel );
        desc1.putReference( idnull, ref1 );
        var idTo = charIDToTypeID( "To  " );
        var ref2 = new ActionReference();
        var idChnl = charIDToTypeID( "Chnl" );
        var idChnl = charIDToTypeID( "Chnl" );
        var idTrsp = charIDToTypeID( "Trsp" );
        ref2.putEnumerated( idChnl, idChnl, idTrsp );
        ref2.putName( charIDToTypeID("Lyr "), TEMP_MARKING_LAYER_NAME );
        desc1.putReference( idTo, ref2 );
        executeAction( idsetd, desc1, DialogModes.NO );
    } catch (e) {
        alert("Could not create selection from marks: " + e + "\nPlease ensure you have painted on the '" + TEMP_MARKING_LAYER_NAME + "' layer.");
        resetUIForNewOperation();
        return;
    }

    var selectionBounds;
    try {
        selectionBounds = doc.selection.bounds;
        if (selectionBounds[0].as('px') == selectionBounds[2].as('px') || selectionBounds[1].as('px') == selectionBounds[3].as('px')) {
            throw new Error("Empty selection");
        }
    } catch (e) {
        alert("No marks detected. Please paint on the '" + TEMP_MARKING_LAYER_NAME + "' layer to indicate areas for inpainting.");
        doc.selection.deselect();
        resetUIForNewOperation();
        return;
    }

    var originalSelectionBounds = [
        selectionBounds[0].as('px'),
        selectionBounds[1].as('px'),
        selectionBounds[2].as('px'),
        selectionBounds[3].as('px')
    ];

    var paddedBounds = [
        Math.max(0, originalSelectionBounds[0] - PADDING_PIXELS), // Use originalSelectionBounds for padding calculation base
        Math.max(0, originalSelectionBounds[1] - PADDING_PIXELS),
        Math.min(doc.width.as('px'), originalSelectionBounds[2] + PADDING_PIXELS),
        Math.min(doc.height.as('px'), originalSelectionBounds[3] + PADDING_PIXELS)
    ];
    var paddedWidth = paddedBounds[2] - paddedBounds[0];
    var paddedHeight = paddedBounds[3] - paddedBounds[0];

    if (paddedWidth <= 0 || paddedHeight <= 0) {
        alert("Calculated padded area has no dimensions. Check padding or selection.\nPadded: " + paddedBounds.join(","));
        doc.selection.deselect();
        resetUIForNewOperation();
        return;
    }

    // The selection from the marks layer should ideally remain active for exportMaskForInpaint.
    // exportImageForInpaint makes its own selections and should restore the document's active layer,
    // but it also deselects at its end. So, we must re-select marks before mask export.

    var tempImageFile, tempMaskFile;
    var tempFilesToCleanup = [];

    try {
        var selectedSourceItem = sourceLayerDropdown.selection;
        if (!selectedSourceItem) {
             throw new Error("No source layer selected in the dropdown.");
        }
        var sourceLayerId = selectedSourceItem.layerId;

        var imageFilePath = Folder.temp + "/" + TEMP_PREFIX + "Image_" + Date.now() + ".png";
        tempImageFile = exportImageForInpaint(doc, sourceLayerId, paddedBounds, imageFilePath);
        if (tempImageFile) {
            tempFilesToCleanup.push(tempImageFile);
        } else {
            throw new Error("Failed to export image for inpainting.");
        }

        // Re-select marks for mask generation
        try {
            doc.activeLayer = tempMarkingLayer; // Ensure correct layer is active
            var idsetd = charIDToTypeID( "setd" );
            var descRS = new ActionDescriptor();
            var idnullRS = charIDToTypeID( "null" );
            var refRS = new ActionReference();
            var idChnlRS = charIDToTypeID( "Chnl" );
            var idfselRS = charIDToTypeID( "fsel" );
            refRS.putProperty( idChnlRS, idfselRS );
            descRS.putReference( idnullRS, refRS );
            var idToRS = charIDToTypeID( "To  " );
            var refToRS = new ActionReference();
            var idChnlToRS = charIDToTypeID( "Chnl" );
            var idChnlToRS2 = charIDToTypeID( "Chnl" );
            var idTrspToRS = charIDToTypeID( "Trsp" );
            refToRS.putEnumerated( idChnlToRS, idChnlToRS2, idTrspToRS );
            refToRS.putName(charIDToTypeID("Lyr "), TEMP_MARKING_LAYER_NAME);
            descRS.putReference( idToRS, refToRS );
            executeAction( idsetd, descRS, DialogModes.NO );
            // Verify selection was made
            if (doc.selection.bounds[0].as('px') == doc.selection.bounds[2].as('px')) {
                 throw new Error("Re-selection of marks for mask resulted in an empty selection.");
            }
        } catch (e) {
            throw new Error("Could not re-select marks for mask generation: " + e);
        }

        // Update originalSelectionBounds again, just in case something changed (shouldn't have)
        var currentSelectionBounds = doc.selection.bounds;
        originalSelectionBounds = [ currentSelectionBounds[0].as('px'), currentSelectionBounds[1].as('px'), currentSelectionBounds[2].as('px'), currentSelectionBounds[3].as('px')];


        var maskFilePath = Folder.temp + "/" + TEMP_PREFIX + "Mask_" + Date.now() + ".png";
        tempMaskFile = exportMaskForInpaint(doc, originalSelectionBounds, paddedBounds, maskFilePath);

        if (tempMaskFile) {
            tempFilesToCleanup.push(tempMaskFile);
        } else {
            throw new Error("Failed to export mask for inpainting.");
        }

        alert("Image and Mask exported (simulated for now):\nImage: " + tempImageFile.fsName + "\nMask: " + tempMaskFile.fsName);
        // Next steps: Base64, API call, Place result, Cleanup...

   } catch (e) {
       alert("Error during submit process: " + e);
       cleanupTempFiles(tempFilesToCleanup);
       resetUIForNewOperation();
       return;
   } finally {
       doc.selection.deselect();
       // Consider if UI should be reset here or after successful API call
   }
   // resetUIForNewOperation(); // Moved to be called on error or full success later
}


// Function to export the relevant image data for inpainting
// boundsArrayPx = [x1, y1, x2, y2] in pixels
function exportImageForInpaint(doc, sourceLayerIdOrSpecial, boundsArrayPx, tempImgPath) {
    var tempFile = new File(tempImgPath);
    var activeLayer = doc.activeLayer; // Save current active layer
    var tempMarkLayerVisible = false;
    var tempMarkLayer;
    try {
        tempMarkLayer = doc.artLayers.getByName(TEMP_MARKING_LAYER_NAME);
        if (tempMarkLayer.visible) {
            tempMarkLayerVisible = true;
            tempMarkLayer.visible = false; // Hide for image capture
        }
    } catch(e) { /* Mark layer might not exist or already hidden */ }

    var success = false;
    try {
        if (sourceLayerIdOrSpecial === "_MERGED_") {
            // Copy Merged for "All Visible Layers (Merged)"
            doc.selection.select([
                [boundsArrayPx[0], boundsArrayPx[1]],
                [boundsArrayPx[2], boundsArrayPx[1]],
                [boundsArrayPx[2], boundsArrayPx[3]],
                [boundsArrayPx[0], boundsArrayPx[3]]
            ], SelectionType.REPLACE, 0, false);
            doc.selection.copy(true); // true for merged
        } else {
            // Specific Layer or Layer Set
            var sourceLayer = findLayerById(doc, sourceLayerIdOrSpecial);
            if (!sourceLayer) {
                // Fallback for older items if ID failed or if name was stored (not ideal)
                // For robustness, one might iterate all layers if findLayerById fails due to an issue.
                // However, current implementation of dropdown stores ID.
                throw new Error("Source layer not found by ID: " + sourceLayerIdOrSpecial);
            }

            if (sourceLayer.typename === "LayerSet") {
                var duplicatedSet = sourceLayer.duplicate();
                // Ensure the duplicated set is visible if the original was, as duplicate() might not preserve this state for sub-layers.
                // However, merging should capture visible content.
                var mergedLayer = duplicatedSet.merge();
                doc.activeLayer = mergedLayer;
                doc.selection.select([
                    [boundsArrayPx[0], boundsArrayPx[1]],
                    [boundsArrayPx[2], boundsArrayPx[1]],
                    [boundsArrayPx[2], boundsArrayPx[3]],
                    [boundsArrayPx[0], boundsArrayPx[3]]
                ], SelectionType.REPLACE, 0, false);
                doc.selection.copy(false);
                mergedLayer.remove();
                try { if(duplicatedSet && duplicatedSet.isValid) duplicatedSet.remove(); } catch(e) {}

            } else { // ArtLayer
                doc.activeLayer = sourceLayer;
                doc.selection.select([
                    [boundsArrayPx[0], boundsArrayPx[1]],
                    [boundsArrayPx[2], boundsArrayPx[1]],
                    [boundsArrayPx[2], boundsArrayPx[3]],
                    [boundsArrayPx[0], boundsArrayPx[3]]
                ], SelectionType.REPLACE, 0, false);
                doc.selection.copy(false);
            }
        }

        var tempDocWidth = new UnitValue(boundsArrayPx[2] - boundsArrayPx[0], "px");
        var tempDocHeight = new UnitValue(boundsArrayPx[3] - boundsArrayPx[1], "px");

        if (tempDocWidth.value <= 0 || tempDocHeight.value <= 0) {
            throw new Error("Calculated image export dimensions are invalid.");
        }

        var tempDoc = app.documents.add(
            tempDocWidth,
            tempDocHeight,
            doc.resolution,
            TEMP_PREFIX + "ImageExport",
            NewDocumentMode.RGBCOLOR,
            DocumentFill.TRANSPARENT
        );
        app.activeDocument = tempDoc; // Ensure focus for paste
        tempDoc.paste();

        var pngSaveOptions = new PNGSaveOptions();
        pngSaveOptions.compression = 0;
        pngSaveOptions.interlaced = false;
        tempDoc.saveAs(tempFile, pngSaveOptions, true, Extension.LOWERCASE);
        tempDoc.close(SaveOptions.DONOTSAVECHANGES);
        success = true;

    } catch (e) {
        alert("Error exporting image: " + e);
        success = false;
        if (app.documents.length > 0 && app.activeDocument.name === TEMP_PREFIX + "ImageExport") {
             app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } finally {
        app.activeDocument = doc; // Switch back to original document
        if (tempMarkLayer && tempMarkLayer.isValid && tempMarkLayerVisible) {
            tempMarkLayer.visible = true; // Restore visibility
        }
        doc.activeLayer = activeLayer; // Restore original active layer
        doc.selection.deselect();
    }
    return success ? tempFile : null;
}


// Function to export the mask based on current selection (from marks layer)
// selectionBoundsPx = original selection bounds [x1,y1,x2,y2] in the original document
// paddedBoundsPx = the larger, padded bounds [x1,y1,x2,y2] for the output mask canvas
// tempMaskPath = path to save the mask PNG
function exportMaskForInpaint(doc, selectionBoundsPx, paddedBoundsPx, tempMaskPath) {
    var tempFile = new File(tempMaskPath);
    var origDocActiveLayer = doc.activeLayer; // Save current active layer of original doc
    var success = false;
    var maskDoc = null;

    try {
        var paddedWidth = paddedBoundsPx[2] - paddedBoundsPx[0];
        var paddedHeight = paddedBoundsPx[3] - paddedBoundsPx[1];

        if (paddedWidth <= 0 || paddedHeight <= 0) throw new Error("Padded area for mask has no dimensions.");

        // Create the new document for the mask
        maskDoc = app.documents.add(
            new UnitValue(paddedWidth, "px"),
            new UnitValue(paddedHeight, "px"),
            doc.resolution,
            TEMP_PREFIX + "MaskExport",
            NewDocumentMode.GRAYSCALE,
            DocumentFill.BLACK // Fill with black
        );
        app.activeDocument = maskDoc; // Switch to the new mask document

        // Calculate the coordinates for the selection in the new mask document
        // This is where the original marks (defined by selectionBoundsPx) will be placed,
        // relative to the top-left of the paddedBoundsPx.
        var selX1_inMaskDoc = selectionBoundsPx[0] - paddedBoundsPx[0];
        var selY1_inMaskDoc = selectionBoundsPx[1] - paddedBoundsPx[1];
        var selX2_inMaskDoc = selectionBoundsPx[2] - paddedBoundsPx[0];
        var selY2_inMaskDoc = selectionBoundsPx[3] - paddedBoundsPx[1];

        // Create the selection in the mask document
        maskDoc.selection.select([
            [selX1_inMaskDoc, selY1_inMaskDoc],
            [selX2_inMaskDoc, selY1_inMaskDoc],
            [selX2_inMaskDoc, selY2_inMaskDoc],
            [selX1_inMaskDoc, selY2_inMaskDoc]
        ]);

        // Fill the selection with white
        var oldFg = app.foregroundColor;
        var white = new SolidColor();
        white.rgb.hexValue = "FFFFFF";
        app.foregroundColor = white;
        maskDoc.selection.fill(app.foregroundColor);
        app.foregroundColor = oldFg; // Restore original foreground color
        maskDoc.selection.deselect();

        // Save the mask document as PNG
        var pngSaveOptions = new PNGSaveOptions();
        pngSaveOptions.compression = 0; // No compression for masks is fine
        pngSaveOptions.interlaced = false;
        maskDoc.saveAs(tempFile, pngSaveOptions, true, Extension.LOWERCASE);
        maskDoc.close(SaveOptions.DONOTSAVECHANGES);
        success = true;

    } catch (e) {
        alert("Error exporting mask: " + e +
              "\nselectionBoundsPx: " + selectionBoundsPx.join(",") +
              "\npaddedBoundsPx: " + paddedBoundsPx.join(",") +
              (maskDoc ? "\nmaskDoc dimensions: " + maskDoc.width.as('px') + "x" + maskDoc.height.as('px') : ""));
        if (maskDoc && maskDoc.isValid) maskDoc.close(SaveOptions.DONOTSAVECHANGES);
        success = false;
    } finally {
        app.activeDocument = doc; // Ensure original doc is active
        doc.activeLayer = origDocActiveLayer; // Restore active layer in original document
        // The selection in the original document should have been handled by exportImageForInpaint or prior steps.
        // If `onSubmitToIOPaintClick` expects selection to be cleared, it should do so explicitly at its end.
    }
    return success ? tempFile : null;
}


// --- Helper Functions (File Operations, API Calls, etc.) ---
// These will be developed in Step 5 and onwards.

function getActiveDoc() {
    if (app.documents.length > 0) {
        return app.activeDocument;
    }
    return null;
}

// Helper function to find a layer (ArtLayer or LayerSet) by its ID within a container (document or layerSet)
function findLayerById(container, id) {
    if (id === null || typeof id === 'undefined') return null;

    function scanLayers(layers) {
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.id === id) {
                return layer;
            }
            if (layer.typename === "LayerSet") { // Check if it's a LayerSet to scan its children
                var foundInSet = scanLayers(layer.layers);
                if (foundInSet) return foundInSet;
            }
        }
        return null;
    }
    return scanLayers(container.layers); // Start scanning from the top-level layers of the container
}

// Helper function to find a layer by name (less reliable than by ID)
function findLayerByName(container, name) {
    // Check artLayers
    for (var i = 0; i < container.artLayers.length; i++) {
        if (container.artLayers[i].name === name) {
            return container.artLayers[i];
        }
    }
    // Check layerSets
    for (var i = 0; i < container.layerSets.length; i++) {
        if (container.layerSets[i].name === name) {
            return container.layerSets[i];
        }
        // Recursive call for nested layer sets
        var foundLayer = findLayerByName(container.layerSets[i], name);
        if (foundLayer) {
            return foundLayer;
        }
    }
    return null; // Not found
}

function resetUIForNewOperation() {
    if (startMarkingButton) startMarkingButton.enabled = true;
    if (submitToIOPaintButton) submitToIOPaintButton.enabled = false;
    // Any other UI cleanup if needed
}

// Stubs for functions to be implemented in future steps
function fileToBase64(file) {
    if (!file || !file.exists) {
        throw new Error("File not found for Base64 conversion: " + (file ? file.fsName : "null"));
    }
    file.encoding = "BINARY"; // Read as binary
    if (!file.open("r")) {
        throw new Error("Could not open file for reading: " + file.fsName);
    }
    var content = file.read();
    file.close();
    return content.toBase64(); // ExtendScript's built-in String.toBase64()
}

// Function to call the IOPaint API
// Returns the File object of the result image, or null on failure.
function callIOPaintAPI(base64ImageData, base64MaskData, resultPath) {
    var resultFile = new File(resultPath);
    var tempPayloadFile; // Declare here for access in catch/finally
    try {
        var jsonData = {
            image: base64ImageData,
            mask: base64MaskData
            // Add other parameters if the server API supports them e.g. model, padding etc.
        };
        var jsonString = JSON.stringify(jsonData);

        // Using a temporary file for the JSON payload can be more reliable with app.system()
        tempPayloadFile = new File(Folder.temp + "/" + TEMP_PREFIX + "payload_" + Date.now() + ".json");
        tempPayloadFile.open("w");
        tempPayloadFile.encoding = "UTF-8";
        tempPayloadFile.write(jsonString);
        tempPayloadFile.close();

        var command;
        var os = $.os.toLowerCase().indexOf("mac") >= 0 ? "mac" : ($.os.toLowerCase().indexOf("win") >= 0 ? "win" : "linux");

        if (os === "mac" || os === "linux") {
            command = 'curl -s -S -X POST "' + IOPaintServerURL + '" ' +
                      '-H "Content-Type: application/json" ' +
                      '--data-binary "@' + tempPayloadFile.fsName + '" ' +
                      '-o "' + resultFile.fsName + '"';
        } else if (os === "win") {
            command = 'powershell -Command "try { ' +
                      '$ProgressPreference = \'SilentlyContinue\'; ' +
                      'Invoke-WebRequest -Uri \"' + IOPaintServerURL + '\" ' +
                      '-Method POST -ContentType \'application/json\' ' +
                      '-InFile \"' + tempPayloadFile.fsName + '\" ' +
                      '-OutFile \"' + resultFile.fsName + '\" ' +
                      '} catch { exit 1 }"';
        } else {
            throw new Error("Unsupported OS for HTTP request: " + $.os);
        }

        // For debugging the command:
        // alert("Executing OS command:\n" + command);

        var systemResult = app.system(command);

        if (tempPayloadFile.exists) tempPayloadFile.remove(); // Clean up payload file

        if (os === "win" && systemResult !== 0) {
             if (!resultFile.exists || resultFile.length === 0) {
                throw new Error("API call failed (Windows). Result file empty or not created. System result: " + systemResult);
             }
        } else if ((os === "mac" || os === "linux") && systemResult !== 0) {
             if (!resultFile.exists || resultFile.length === 0) {
                throw new Error("API call failed (mac/linux). Result file empty or not created. Curl exit code: " + systemResult);
             }
        }

        if (!resultFile.exists || resultFile.length === 0) {
            throw new Error("API call completed but result file is missing or empty. URL: " + IOPaintServerURL);
        }

        return resultFile;

    } catch (e) {
        if (tempPayloadFile && tempPayloadFile.exists) tempPayloadFile.remove();
        alert("Error calling IOPaint API: " + e + "\nURL: " + IOPaintServerURL);
        return null;
    }
}

function placeResultImage(doc, resultImagePathFile, targetBoundsArrayPx, originalSelectionForMaskBoundsArrayPx) {
    alert("placeResultImage not implemented. \nResult Image path: " + (resultImagePathFile ? resultImagePathFile.fsName : "null") +
          "\nTarget (padded) bounds: " + targetBoundsArrayPx.join(",") +
          "\nOriginal selection bounds (for mask): " + originalSelectionForMaskBoundsArrayPx.join(","));
    // Placeholder: Logic to place the image, apply mask, etc.
    if (resultImagePathFile && resultImagePathFile.exists) {
        var newLayer = doc.artLayers.add();
        newLayer.name = RESULT_LAYER_NAME + " (Simulated)";
        if (doc.layers.length > 1) {
            newLayer.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
        }
        // alert("Simulated placing result image as layer: " + newLayer.name);
    } else {
        // alert("placeResultImage: Result image file is null or does not exist.");
    }
}

function cleanupTempFiles(fileArray) {
    if (!fileArray) return;
    for (var i = 0; i < fileArray.length; i++) {
        try {
            if (fileArray[i] && fileArray[i].exists) {
                fileArray[i].remove();
            }
        } catch (e) {
            // alert("Could not delete temporary file: " + (fileArray[i] ? fileArray[i].fsName : "undefined") + "\n" + e);
        }
    }
}
// Note: Old placeholder functions (saveSelectionToPNG, saveLayerToPNG, etc.) were below and are now removed.

// --- Palette Close Handler (Step 6) ---
function onPaletteClose() {
    try {
        var doc = getActiveDoc();
        if (doc && mainWindow && mainWindow.visible) {
            var tempLayer = doc.artLayers.getByName(TEMP_MARKING_LAYER_NAME);
            tempLayer.remove();
        }
    } catch (e) { /* log or ignore */ }
    return true;
}

// --- Script Entry Point ---
main();
