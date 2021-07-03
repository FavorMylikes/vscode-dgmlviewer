(function () {

  var nodeElements = [];
  var edgeElements = [];
  var nodeCoordinates = [];
  const edgeArrowType = 'triangle'; // edge arrow to type

  // var nodes = new vis.DataSet([]);

  // nodes.forEach(nodeId => {
  //   nodes.get(nodeId).color = {
  //     background: "#D2E5FF" // nodes default background color
  //   };
  // });

  // var edges = new vis.DataSet([]);

  // let data = {
  //   nodes: nodes,
  //   edges: edges
  // };
  // const options = {
  //   interaction: {
  //     hover: true
  //   },
  //   nodes: {
  //     shape: 'box' // The shape of the nodes.
  //   },
  //   layout: {} // The layout of the directed graph
  // };
  const defaultGraphDirection = ''; // The graph direction from the dgml file itself
  const cyContainerDiv = document.getElementById('cy');
  const txtCanvas = document.createElement('canvas');
  const txtCtx = txtCanvas.getContext('2d');
  const hierarchicalOptionsDirection = document.getElementById('hierarchicalOptions_direction');
  const hierarchicalOptionsSortMethod = document.getElementById('hierarchicalOptions_sortmethod');
  const showHierarchicalOptionsCheckbox = document.getElementById('showHierarchicalOptions');
  const hierarchicalOptionsDirectionSelect = document.getElementById('direction');
  const hierarchicalOptionsSortMethodSelect = document.getElementById('sortMethod');
  const saveAsPngButton = document.getElementById('saveAsPngButton');
  const saveSelectionAsPngButton = document.getElementById('saveSelectionAsPngButton');
  // const graphDiv = document.getElementById('network');
  const selectionLayer = document.getElementById('selectionLayer');
  const helpTextDiv = document.getElementById('helpText');
  showHierarchicalOptions();

  const vscode = acquireVsCodeApi();
  let lastMouseX = lastMouseY = 0;
  let mouseX = mouseY = 0;
  let selection;
  // get the vis.js canvas
  var visDiv = cyContainerDiv.firstElementChild;
  var graphCanvas = visDiv.firstElementChild;
  const selectionCanvas = selectionLayer.firstElementChild;
  let selectionCanvasContext;

  // add button event listeners
  saveAsPngButton.addEventListener('click', saveAsPng);
  saveSelectionAsPngButton.addEventListener('click', saveSelectionAsPng);
  showHierarchicalOptionsCheckbox.addEventListener('click', showHierarchicalOptions);
  hierarchicalOptionsDirectionSelect.addEventListener('change', setNetworkLayout);
  hierarchicalOptionsSortMethodSelect.addEventListener('change', setNetworkLayout);

  function mouseUpEventListener(event) {
    // Convert the canvas to image data that can be saved
    const aspectRatioX = graphCanvas.width / selectionCanvas.width;
    const aspectRatioY = graphCanvas.height / selectionCanvas.height;
    const finalSelectionCanvas = document.createElement('canvas');
    finalSelectionCanvas.width = selection.width;
    finalSelectionCanvas.height = selection.height;
    const finalSelectionCanvasContext = finalSelectionCanvas.getContext('2d');
    finalSelectionCanvasContext.drawImage(graphCanvas, selection.top * aspectRatioX, selection.left * aspectRatioY, selection.width * aspectRatioX, selection.height * aspectRatioY, 0, 0, selection.width, selection.height);

    // Call back to the extension context to save the selected image to the workspace folder.
    vscode.postMessage({
      command: 'saveAsPng',
      text: finalSelectionCanvas.toDataURL()
    });
    // Remove the temporary canvas
    finalSelectionCanvas.remove();
    // Reset the state variables
    selectionCanvasContext = undefined;
    selection = {};
    // hide the help text
    helpTextDiv.style['display'] = 'none';
    // hide selection layer and remove event listeners
    selectionLayer.removeEventListener('mouseup', mouseUpEventListener);
    selectionLayer.removeEventListener('mousedown', mouseDownEventListener);
    selectionLayer.removeEventListener('mousemove', mouseMoveEventListener);
    selectionLayer.style['display'] = 'none';
  }

  function mouseDownEventListener(event) {
    lastMouseX = parseInt(event.clientX - selectionCanvas.offsetLeft);
    lastMouseY = parseInt(event.clientY - selectionCanvas.offsetTop);
    selectionCanvasContext = selectionCanvas.getContext("2d");
  }

  function drawGuideLine(ctx, mouseX, mouseY) {
    ctx.beginPath();
    ctx.setLineDash([3, 7]);
    if (mouseX > -1) {
      ctx.moveTo(mouseX, 0);
      ctx.lineTo(mouseX, selectionCanvas.height);
    } else if (mouseY > -1) {
      ctx.moveTo(0, mouseY);
      ctx.lineTo(selectionCanvas.width, mouseY);
    }
    ctx.strokeStyle = 'blue'; // graph selection guideline color
    ctx.lineWidth = 1; // graph selection guideline width
    ctx.stroke();
  }

  function showGuideLines() {
    var tmpSelectionCanvasContext = selectionCanvas.getContext("2d");
    tmpSelectionCanvasContext.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
    drawGuideLine(tmpSelectionCanvasContext, mouseX, -1);
    drawGuideLine(tmpSelectionCanvasContext, -1, mouseY);
  }

  function mouseMoveEventListener(event) {
    mouseX = parseInt(event.clientX - selectionCanvas.offsetLeft);
    mouseY = parseInt(event.clientY - selectionCanvas.offsetTop);
    showGuideLines();
    if (selectionCanvasContext != undefined) {
      selectionCanvasContext.beginPath();
      selectionCanvasContext.setLineDash([]);
      const width = mouseX - lastMouseX;
      const height = mouseY - lastMouseY;
      selectionCanvasContext.rect(lastMouseX, lastMouseY, width, height);
      selection = { // Save the current position and size to be used when the mouseup event is fired
        'top': lastMouseX,
        'left': lastMouseY,
        'height': height,
        'width': width
      };
      selectionCanvasContext.strokeStyle = 'red';
      selectionCanvasContext.lineWidth = 2;
      selectionCanvasContext.stroke();
    }
  }

  function saveSelectionAsPng() {
    visDiv = graphDiv.firstElementChild;
    graphCanvas = visDiv.firstElementChild;

    // show the help text
    helpTextDiv.style['display'] = 'block';

    // show the selection layer
    selectionLayer.style['display'] = 'block';

    // make sure the selection canvas covers the whole screen
    selectionCanvas.width = window.innerWidth;
    selectionCanvas.height = window.innerHeight;
    // reset the current context and selection
    selectionCanvasContext = undefined;
    selection = {};

    selectionLayer.addEventListener("mouseup", mouseUpEventListener, true);
    selectionLayer.addEventListener("mousedown", mouseDownEventListener, true);
    selectionLayer.addEventListener("mousemove", mouseMoveEventListener, true);
  }

  function openFileInVsCode(filepath) {
    vscode.postMessage({
      command: 'openFile',
      text: filepath
    });
  }

  function saveAsPng() {
    visDiv = graphDiv.firstElementChild;
    graphCanvas = visDiv.firstElementChild;

    // Calculate the bounding box of all the elements on the canvas
    const boundingBox = getBoundingBox();

    // copy the imagedata within the bounding box
    const finalSelectionCanvas = document.createElement('canvas');
    finalSelectionCanvas.width = boundingBox.width;
    finalSelectionCanvas.height = boundingBox.height;
    const finalSelectionCanvasContext = finalSelectionCanvas.getContext('2d');
    finalSelectionCanvasContext.drawImage(graphCanvas, boundingBox.top, boundingBox.left, boundingBox.width, boundingBox.height, 0, 0, boundingBox.width, boundingBox.height);

    // Call back to the extension context to save the image of the graph to the workspace folder.
    vscode.postMessage({
      command: 'saveAsPng',
      text: finalSelectionCanvas.toDataURL()
    });

    // Remove the temporary canvas
    finalSelectionCanvas.remove();
  }

  function getBoundingBox() {
    var ctx = graphCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, graphCanvas.width, graphCanvas.height);
    var bytesPerPixels = 4;
    var cWidth = graphCanvas.width * bytesPerPixels;
    var cHeight = graphCanvas.height;
    var minY = minX = maxY = maxX = -1;
    for (var y = cHeight; y > 0 && maxY === -1; y--) {
      for (var x = 0; x < cWidth; x += bytesPerPixels) {
        var arrayPos = x + y * cWidth;
        if (imgData.data[arrayPos + 3] > 0 && maxY === -1) {
          maxY = y;
          break;
        }
      }
    }
    for (var x = cWidth; x >= 0 && maxX === -1; x -= bytesPerPixels) {
      for (var y = 0; y < maxY; y++) {
        var arrayPos = x + y * cWidth;
        if (imgData.data[arrayPos + 3] > 0 && maxX === -1) {
          maxX = x / bytesPerPixels;
          break;
        }
      }
    }
    for (var x = 0; x < maxX * bytesPerPixels && minX === -1; x += bytesPerPixels) {
      for (var y = 0; y < maxY; y++) {
        var arrayPos = x + y * cWidth;
        if (imgData.data[arrayPos + 3] > 0 && minX === -1) {
          minX = x / bytesPerPixels;
          break;
        }
      }
    }
    for (var y = 0; y < maxY && minY === -1; y++) {
      for (var x = minX * bytesPerPixels; x < maxX * bytesPerPixels; x += bytesPerPixels) {
        var arrayPos = x + y * cWidth;
        if (imgData.data[arrayPos + 3] > 0 && minY === -1) {
          minY = y;
          break;
        }
      }
    }
    return {
      'top': minX,
      'left': minY,
      'width': maxX - minX,
      'height': maxY - minY
    };
  }

  function showHierarchicalOptions() {
    setDefaultGraphDirection();
    setNetworkLayout();
  }

  function setDefaultGraphDirection() {
    let selectedOption = '';
    selectedOption = defaultGraphDirection === '' ? 'Fixed' : defaultGraphDirection;
    for (var i, j = 0; i = hierarchicalOptionsDirectionSelect.options[j]; j++) {
      if (i.value === selectedOption) {
        hierarchicalOptionsDirectionSelect.selectedIndex = j;
        break;
      }
    }
  }

  function storeCoordinates() {
    // nodes.forEach(node => {
    //   if (node.x !== undefined && node.y !== undefined) {
    //     nodeCoordinates[node.id] = {
    //       x: node.x,
    //       y: node.y
    //     };
    //   }
    //   delete node.x;
    //   delete node.y;
    //   delete node.fixed;
    // });
  }

  function restoreCoordinates() {
    // nodes.forEach(function (node) {
    //   if (node.id in nodeCoordinates) {
    //     var nodeCoords = nodeCoordinates[node.id];
    //     nodes.update({
    //       id: node.id,
    //       fixed: true,
    //       x: nodeCoords.x,
    //       y: nodeCoords.y
    //     });
    //   }
    // });
  }

  function setHierarchicalLayout(direction, sortMethod) {
    // options.layout = {
    //   hierarchical: {
    //     enabled: true,
    //     levelSeparation: 200,
    //     nodeSpacing: 200,
    //     direction: direction,
    //     sortMethod: sortMethod
    //   }
    // };
    // options.physics = {
    //   enabled: true,
    //   hierarchicalRepulsion: {
    //     springConstant: 0,
    //     avoidOverlap: 0.2
    //   }
    // };
  }

  function calculateLabelWidths() {
    nodeElements.forEach(node => {
      if(node.data.label && node.data.label.length > 0) {
        node.data.width = txtCtx.measureText(node.data.label).width * 1.75; // Don't know why, but the width of node has to be about 75% bigger than the width of the label text.
      }
    });
  }

  function setNetworkLayout() {
    hierarchicalOptionsDirection.style['display'] = showHierarchicalOptionsCheckbox.checked ? 'block' : 'none';
    hierarchicalOptionsSortMethod.style['display'] = showHierarchicalOptionsCheckbox.checked ? 'block' : 'none';

    // options.layout = {
    //   hierarchical: {
    //     enabled: false
    //   }
    // };
    // options.physics = {
    //   enabled: true,
    //   barnesHut: {
    //     springConstant: 0,
    //     avoidOverlap: 0.8
    //   }
    // };
    var unfixNodes = false;
    if (showHierarchicalOptionsCheckbox.checked) {
      if (hierarchicalOptionsDirectionSelect.value && hierarchicalOptionsDirectionSelect.value === 'Random') {
        storeCoordinates();
        seed = Math.random();
        options.layout.randomSeed = seed;
      } else if (hierarchicalOptionsDirectionSelect.value && hierarchicalOptionsDirectionSelect.value === 'Fixed') {
        restoreCoordinates();
        options.physics.enabled = false;
        unfixNodes = true;
      } else {
        storeCoordinates();
        const direction = hierarchicalOptionsDirectionSelect.value ? hierarchicalOptionsDirectionSelect.value : defaultGraphDirection;
        const sortMethod = hierarchicalOptionsSortMethodSelect.value ? hierarchicalOptionsSortMethodSelect.value : 'hubsize';
        setHierarchicalLayout(direction, sortMethod);
      }
    } else {
      if (defaultGraphDirection !== '') {
        storeCoordinates();
        setHierarchicalLayout(defaultGraphDirection, 'hubsize');
      } else {
        restoreCoordinates();
        unfixNodes = false;
      }
    }
    calculateLabelWidths();
    var cy = cytoscape({
      container: cyContainerDiv,

      style: [{
          selector: 'node',
          style: {
            'width': 'data(width)',
            'label': 'data(label)',
            'text-valign': 'center',
            'color': "white",
            'shape': 'round-rectangle',
            'background-color': 'data(background)',
            'border-style': 'data(borderStyle)',
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(width)',
            'line-color': 'data(color)',
            'curve-style': 'bezier',
            'target-arrow-shape': edgeArrowType,
            'line-style': 'data(lineStyle)',
          }
        }
      ],

      elements: {

        nodes: nodeElements,
        edges: edgeElements
      },

      layout: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 30,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      },
      minZoom: 0.5,
      maxZoom: 3,
      motionBlur: true,
      wheelSensitivity: 0.05,
    });
    // var network = new vis.Network(container, data, options);
    // if (unfixNodes) {
    //   nodes.forEach(function (node) {
    //     nodes.update({
    //       id: node.id,
    //       fixed: false
    //     });
    //   });
    // }
    // network.on("stabilizationIterationsDone", function () {
    //   network.setOptions({
    //     physics: {
    //       enabled: false
    //     }
    //   });
    //   nodes.forEach(function (node) {
    //     nodes.update({
    //       id: node.id,
    //       fixed: false
    //     });
    //   });
    // });
    // network.on("selectNode", function (params) {
    //   if (params.nodes.length === 1) {
    //     var node = nodes.get(params.nodes[0]);
    //     openFileInVsCode(node.filepath);
    //   }
    // });
    // network.on("hoverNode", function (params) {
    //   var node = nodes.get(params.node);
    //   if (node.filepath && node.filepath.length > 0) {
    //     network.canvas.body.container.style.cursor = 'pointer';
    //   }
    // });
    // network.on("blurNode", function (params) {
    //   network.canvas.body.container.style.cursor = 'default';
    // });
  }
}());