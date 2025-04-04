document.addEventListener("DOMContentLoaded", () => {
  // Cargar bibliotecas necesarias
  if (typeof fabric === "undefined") {
    console.error(
      "Fabric.js no está cargado. El editor no funcionará correctamente."
    );
    return;
  }

  if (typeof bootstrap === "undefined") {
    console.error(
      "Bootstrap no está cargado. Algunas funcionalidades pueden no estar disponibles."
    );
  }

  // Objeto para manejar el historial de acciones (undo/redo)
  const history = {
    stack: [],
    currentIndex: -1,
    maxSteps: 30,

    save: function () {
      // Truncar el historial si hacemos una nueva acción después de deshacer
      if (this.currentIndex < this.stack.length - 1) {
        this.stack = this.stack.slice(0, this.currentIndex + 1);
      }

      // Guardar el estado actual del canvas
      const json = JSON.stringify(canvas.toJSON(["id", "selectable"]));
      this.stack.push(json);

      // Limitar el tamaño del historial
      if (this.stack.length > this.maxSteps) {
        this.stack.shift();
      } else {
        this.currentIndex++;
      }

      // Actualizar estado de los botones undo/redo
      updateUndoRedoButtons();
    },

    undo: function () {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.restore();
        updateUndoRedoButtons();
        return true;
      }
      return false;
    },

    redo: function () {
      if (this.currentIndex < this.stack.length - 1) {
        this.currentIndex++;
        this.restore();
        updateUndoRedoButtons();
        return true;
      }
      return false;
    },

    restore: function () {
      if (this.currentIndex >= 0 && this.stack[this.currentIndex]) {
        canvas.loadFromJSON(this.stack[this.currentIndex], () => {
          canvas.renderAll();
          updateLayersList();
        });
      }
    },
  };

  // Initialize Fabric.js canvas
  const canvas = new fabric.Canvas("canvas", {
    width: 800,
    height: 600,
    backgroundColor: "#ffffff",
    preserveObjectStacking: true, // Mantiene el orden de apilamiento de objetos
  });

  // Current tool and state
  let currentTool = "select";
  let isDrawing = false;
  let startPoint = null;
  let currentObject = null;
  let objectCounter = 0; // Para asignar nombres únicos a los objetos
  let showGrid = false; // Estado de la cuadrícula
  let snapToGrid = false; // Estado del ajuste a la cuadrícula
  const gridSize = 20; // Tamaño de la cuadrícula

  // Initialize properties
  const fillColor = document.getElementById("fill-color");
  const strokeColor = document.getElementById("stroke-color");
  const strokeWidth = document.getElementById("stroke-width");
  const opacity = document.getElementById("opacity");
  const strokeWidthValue = document.getElementById("stroke-width-value");
  const opacityValue = document.getElementById("opacity-value");

  // Tool buttons
  const toolButtons = {
    select: document.getElementById("select-tool"),
    rect: document.getElementById("rect-tool"),
    circle: document.getElementById("circle-tool"),
    line: document.getElementById("line-tool"),
    path: document.getElementById("path-tool"),
    text: document.getElementById("text-tool"),
  };

  // Action buttons
  const newCanvasBtn = document.getElementById("new-canvas");
  const exportSvgBtn = document.getElementById("export-svg");
  const exportPngBtn = document.getElementById("export-png");
  const exportJpgBtn = document.getElementById("export-jpg");
  const deleteSelectedBtn = document.getElementById("delete-selected");
  const downloadExportBtn = document.getElementById("download-export");

  // Añadir botones de undo/redo
  const undoBtn =
    document.getElementById("undo-btn") || document.createElement("button");
  const redoBtn =
    document.getElementById("redo-btn") || document.createElement("button");

  if (
    !document.getElementById("undo-btn") &&
    deleteSelectedBtn &&
    deleteSelectedBtn.parentNode
  ) {
    undoBtn.id = "undo-btn";
    undoBtn.className = "btn btn-outline-secondary me-2";
    undoBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Deshacer';
    undoBtn.disabled = true;
    deleteSelectedBtn.parentNode.insertBefore(undoBtn, deleteSelectedBtn);
  }

  if (
    !document.getElementById("redo-btn") &&
    deleteSelectedBtn &&
    deleteSelectedBtn.parentNode
  ) {
    redoBtn.id = "redo-btn";
    redoBtn.className = "btn btn-outline-secondary me-2";
    redoBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Rehacer';
    redoBtn.disabled = true;
    deleteSelectedBtn.parentNode.insertBefore(redoBtn, deleteSelectedBtn);
  }

  // Modal elements
  const exportModal = document.getElementById("exportModal")
    ? new bootstrap.Modal(document.getElementById("exportModal"))
    : null;
  const exportFilename = document.getElementById("export-filename");
  const exportPreview = document.getElementById("export-preview");
  const exportCode = document.getElementById("export-code");

  // Función para convertir RGB a Hex
  function rgbToHex(rgb) {
    // Si ya es un color hex, devolverlo tal cual
    if (rgb && rgb.startsWith("#")) {
      return rgb;
    }

    // Si es rgb o rgba, convertirlo
    if (rgb && (rgb.startsWith("rgb") || rgb.startsWith("rgba"))) {
      const rgbValues = rgb.match(/\d+/g);
      if (rgbValues && rgbValues.length >= 3) {
        const r = parseInt(rgbValues[0]);
        const g = parseInt(rgbValues[1]);
        const b = parseInt(rgbValues[2]);
        return `#${((1 << 24) + (r << 16) + (g << 8) + b)
          .toString(16)
          .slice(1)}`;
      }
    }

    // Si no se puede convertir, devolver un color por defecto
    return "#000000";
  }

  // Función para asignar identificadores únicos a los objetos
  function assignObjectId(obj) {
    const typeMap = {
      rect: "Rectángulo",
      circle: "Círculo",
      line: "Línea",
      path: "Trazo",
      "i-text": "Texto",
      group: "Grupo",
    };

    objectCounter++;
    const typeName = typeMap[obj.type] || "Objeto";
    obj.id = `${typeName}-${objectCounter}`;
    obj.name = obj.id;
    return obj;
  }

  // Función para actualizar botones undo/redo
  function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = history.currentIndex <= 0;
    if (redoBtn)
      redoBtn.disabled = history.currentIndex >= history.stack.length - 1;
  }

  // Set active tool
  function setActiveTool(tool) {
    currentTool = tool;

    // Remove active class from all tool buttons
    Object.values(toolButtons).forEach((button) => {
      if (button) button.classList.remove("active");
    });

    // Add active class to selected tool button
    if (toolButtons[tool]) toolButtons[tool].classList.add("active");

    // Desactivar modo dibujo para todas las herramientas excepto path
    canvas.isDrawingMode = tool === "path";

    if (tool === "path") {
      canvas.freeDrawingBrush.width = Number.parseInt(strokeWidth.value, 10);
      canvas.freeDrawingBrush.color = strokeColor.value;
      canvas.freeDrawingBrush.opacity =
        Number.parseInt(opacity.value, 10) / 100;
    } else if (tool === "select") {
      // Asegurarse de que los objetos sean seleccionables
      canvas.getObjects().forEach((obj) => {
        if (obj.id !== "grid") {
          obj.selectable = true;
        }
      });
    } else if (tool === "text") {
      addText();
      // Cambiar automáticamente a la herramienta de selección después de añadir texto
      setTimeout(() => {
        setActiveTool("select");
      }, 100);
    }

    // Actualizar cursor según la herramienta
    updateCanvasCursor(tool);
  }

  // Actualizar el cursor del canvas según la herramienta
  function updateCanvasCursor(tool) {
    let cursorStyle = "default";

    switch (tool) {
      case "select":
        cursorStyle = "default";
        break;
      case "path":
        cursorStyle = "crosshair";
        break;
      case "text":
        cursorStyle = "text";
        break;
      default:
        cursorStyle = "crosshair";
    }

    canvas.defaultCursor = cursorStyle;
    canvas.hoverCursor = tool === "select" ? "move" : cursorStyle;
    canvas.renderAll();
  }

  // Initialize tool buttons
  Object.keys(toolButtons).forEach((tool) => {
    if (toolButtons[tool]) {
      toolButtons[tool].addEventListener("click", () => {
        setActiveTool(tool);
      });
    }
  });

  // Set default active tool
  setActiveTool("select");

  // Update property displays
  if (strokeWidth) {
    strokeWidth.addEventListener("input", () => {
      if (strokeWidthValue)
        strokeWidthValue.textContent = `${strokeWidth.value}px`;
      if (currentTool === "path") {
        canvas.freeDrawingBrush.width = Number.parseInt(strokeWidth.value, 10);
      }
      updateSelectedObject();
    });
  }

  if (opacity) {
    opacity.addEventListener("input", () => {
      if (opacityValue) opacityValue.textContent = `${opacity.value}%`;
      if (currentTool === "path") {
        canvas.freeDrawingBrush.opacity =
          Number.parseInt(opacity.value, 10) / 100;
      }
      updateSelectedObject();
    });
  }

  if (fillColor) fillColor.addEventListener("input", updateSelectedObject);
  if (strokeColor) {
    strokeColor.addEventListener("input", () => {
      if (currentTool === "path") {
        canvas.freeDrawingBrush.color = strokeColor.value;
      }
      updateSelectedObject();
    });
  }

  // Update selected object properties
  function updateSelectedObject() {
    const activeObject = canvas.getActiveObject();
    if (activeObject && fillColor && strokeColor && strokeWidth && opacity) {
      // Guardar propiedades antes de modificar
      const oldProps = {
        fill: activeObject.fill,
        stroke: activeObject.stroke,
        strokeWidth: activeObject.strokeWidth,
        opacity: activeObject.opacity,
      };

      // Aplicar nuevas propiedades
      activeObject.set({
        fill: fillColor.value,
        stroke: strokeColor.value,
        strokeWidth: Number.parseInt(strokeWidth.value, 10),
        opacity: Number.parseInt(opacity.value, 10) / 100,
      });

      canvas.renderAll();

      // Verificar si hubo cambios para guardar en historial
      if (
        oldProps.fill !== fillColor.value ||
        oldProps.stroke !== strokeColor.value ||
        oldProps.strokeWidth !== Number.parseInt(strokeWidth.value, 10) ||
        oldProps.opacity !== Number.parseInt(opacity.value, 10) / 100
      ) {
        history.save();
      }

      updateLayersList();
    }
  }

  // Función para sincronizar los controles de propiedades con el objeto seleccionado
  function syncPropertiesWithSelectedObject() {
    const activeObject = canvas.getActiveObject();
    if (
      activeObject &&
      fillColor &&
      strokeColor &&
      strokeWidth &&
      opacity &&
      strokeWidthValue &&
      opacityValue
    ) {
      // Actualizar controles con las propiedades del objeto seleccionado
      if (activeObject.fill && activeObject.fill !== "transparent") {
        fillColor.value = rgbToHex(activeObject.fill);
      }

      if (activeObject.stroke) {
        strokeColor.value = rgbToHex(activeObject.stroke);
      }

      if (activeObject.strokeWidth) {
        strokeWidth.value = activeObject.strokeWidth;
        strokeWidthValue.textContent = `${activeObject.strokeWidth}px`;
      }

      if (activeObject.opacity !== undefined) {
        const opacityPercentage = Math.round(activeObject.opacity * 100);
        opacity.value = opacityPercentage;
        opacityValue.textContent = `${opacityPercentage}%`;
      }
    }
  }

  // Canvas mouse down event
  canvas.on("mouse:down", (options) => {
    if (currentTool === "select") return;

    isDrawing = true;
    startPoint = canvas.getPointer(options.e);

    // Ajustar a la cuadrícula si está activado
    if (snapToGrid) {
      startPoint.x = Math.round(startPoint.x / gridSize) * gridSize;
      startPoint.y = Math.round(startPoint.y / gridSize) * gridSize;
    }

    switch (currentTool) {
      case "rect":
        currentObject = new fabric.Rect({
          left: startPoint.x,
          top: startPoint.y,
          width: 0,
          height: 0,
          fill: fillColor ? fillColor.value : "#3498db",
          stroke: strokeColor ? strokeColor.value : "#000000",
          strokeWidth: strokeWidth ? Number.parseInt(strokeWidth.value, 10) : 2,
          opacity: opacity ? Number.parseInt(opacity.value, 10) / 100 : 1,
          selectable: true,
        });
        assignObjectId(currentObject);
        canvas.add(currentObject);
        break;

      case "circle":
        currentObject = new fabric.Circle({
          left: startPoint.x,
          top: startPoint.y,
          radius: 0,
          fill: fillColor ? fillColor.value : "#3498db",
          stroke: strokeColor ? strokeColor.value : "#000000",
          strokeWidth: strokeWidth ? Number.parseInt(strokeWidth.value, 10) : 2,
          opacity: opacity ? Number.parseInt(opacity.value, 10) / 100 : 1,
          selectable: true,
        });
        assignObjectId(currentObject);
        canvas.add(currentObject);
        break;

      case "line":
        currentObject = new fabric.Line(
          [startPoint.x, startPoint.y, startPoint.x, startPoint.y],
          {
            stroke: strokeColor ? strokeColor.value : "#000000",
            strokeWidth: strokeWidth
              ? Number.parseInt(strokeWidth.value, 10)
              : 2,
            opacity: opacity ? Number.parseInt(opacity.value, 10) / 100 : 1,
            selectable: true,
          }
        );
        assignObjectId(currentObject);
        canvas.add(currentObject);
        break;
    }
  });

  // Canvas mouse move event
  canvas.on("mouse:move", (options) => {
    if (!isDrawing) return;

    const pointer = canvas.getPointer(options.e);

    // Ajustar a la cuadrícula si está activado
    if (snapToGrid) {
      pointer.x = Math.round(pointer.x / gridSize) * gridSize;
      pointer.y = Math.round(pointer.y / gridSize) * gridSize;
    }

    switch (currentTool) {
      case "rect":
        if (startPoint.x > pointer.x) {
          currentObject.set({ left: pointer.x });
        }
        if (startPoint.y > pointer.y) {
          currentObject.set({ top: pointer.y });
        }

        currentObject.set({
          width: Math.abs(startPoint.x - pointer.x),
          height: Math.abs(startPoint.y - pointer.y),
        });
        break;

      case "circle":
        const radius =
          Math.sqrt(
            Math.pow(startPoint.x - pointer.x, 2) +
              Math.pow(startPoint.y - pointer.y, 2)
          ) / 2;

        const centerX = (startPoint.x + pointer.x) / 2;
        const centerY = (startPoint.y + pointer.y) / 2;

        currentObject.set({
          left: centerX - radius,
          top: centerY - radius,
          radius: radius,
        });
        break;

      case "line":
        currentObject.set({
          x2: pointer.x,
          y2: pointer.y,
        });
        break;
    }

    canvas.renderAll();
  });

  // Canvas mouse up event
  canvas.on("mouse:up", () => {
    if (isDrawing) {
      isDrawing = false;

      if (currentObject) {
        // Verificar si el objeto es demasiado pequeño (dibujo accidental)
        let isTooSmall = false;

        if (
          currentObject.type === "rect" &&
          (currentObject.width < 5 || currentObject.height < 5)
        ) {
          isTooSmall = true;
        } else if (
          currentObject.type === "circle" &&
          currentObject.radius < 3
        ) {
          isTooSmall = true;
        } else if (
          currentObject.type === "line" &&
          Math.sqrt(
            Math.pow(currentObject.x2 - currentObject.x1, 2) +
              Math.pow(currentObject.y2 - currentObject.y1, 2)
          ) < 5
        ) {
          isTooSmall = true;
        }

        if (isTooSmall) {
          canvas.remove(currentObject);
        } else {
          currentObject.setCoords();
          canvas.setActiveObject(currentObject);
          history.save();

          // Cambiar automáticamente a la herramienta de selección después de dibujar
          setActiveTool("select");
        }

        currentObject = null;
        updateLayersList();
      }
    }
  });

  // Add text to canvas
  function addText() {
    const text = new fabric.IText("Doble clic para editar", {
      left: canvas.width / 2,
      top: canvas.height / 2,
      fontFamily: "Arial",
      fill: fillColor ? fillColor.value : "#3498db",
      stroke: strokeColor ? strokeColor.value : "#000000",
      strokeWidth: strokeWidth ? Number.parseInt(strokeWidth.value, 10) : 2,
      opacity: opacity ? Number.parseInt(opacity.value, 10) / 100 : 1,
      originX: "center",
      originY: "center",
      selectable: true,
    });

    assignObjectId(text);
    canvas.add(text);
    canvas.setActiveObject(text);
    history.save();
    updateLayersList();
  }

  // Eventos de selección
  canvas.on("selection:created", syncPropertiesWithSelectedObject);
  canvas.on("selection:updated", syncPropertiesWithSelectedObject);

  // Object added event
  canvas.on("object:added", (e) => {
    // No actualizamos el historial aquí porque ya lo hacemos después de terminar de dibujar
    // y cuando añadimos texto
    if (e.target.type === "path") {
      assignObjectId(e.target);
      history.save();

      // Cambiar automáticamente a la herramienta de selección después de dibujar un path
      if (currentTool === "path") {
        setTimeout(() => {
          setActiveTool("select");
        }, 100);
      }
    }
    updateLayersList();
  });

  // Object removed event
  canvas.on("object:removed", () => {
    updateLayersList();
  });

  // Object modified event
  canvas.on("object:modified", () => {
    history.save();
    updateLayersList();
  });

  // Mejorar la gestión de capas
  function updateLayersList() {
    const layersList = document.getElementById("layers-list");
    if (!layersList) return;

    layersList.innerHTML = "";

    // Obtener objetos en orden inverso (los últimos dibujados aparecen primero)
    // Filtrar para no mostrar las líneas de la cuadrícula como capas
    const objects = canvas
      .getObjects()
      .filter((obj) => obj.id !== "grid")
      .slice()
      .reverse();

    objects.forEach((obj, reversedIndex) => {
      const index = objects.length - 1 - reversedIndex; // Índice real en el canvas
      const layerItem = document.createElement("li");
      layerItem.className =
        "list-group-item layer-item d-flex align-items-center";
      layerItem.dataset.index = index;

      // Destacar la capa seleccionada
      if (obj === canvas.getActiveObject()) {
        layerItem.classList.add("active", "bg-light");
      }

      // Añadir drag handle para reordenar capas
      const dragHandle = document.createElement("span");
      dragHandle.className = "drag-handle me-2 cursor-move";
      dragHandle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
      dragHandle.style.cursor = "move";
      layerItem.appendChild(dragHandle);

      // Obtener nombre de objeto
      const objectName = obj.name || `Objeto ${index + 1}`;

      // Crear miniatura de la capa
      const thumbnail = document.createElement("div");
      thumbnail.className = "layer-thumbnail me-2";
      thumbnail.style.width = "30px";
      thumbnail.style.height = "30px";
      thumbnail.style.border = "1px solid #ddd";
      thumbnail.style.position = "relative";
      thumbnail.style.backgroundColor = "#f8f9fa";
      thumbnail.style.borderRadius = "4px";
      thumbnail.style.overflow = "hidden";

      // Añadir color de fondo o indicador según el tipo
      if (obj.type === "rect" || obj.type === "circle") {
        thumbnail.style.backgroundColor = obj.fill || "transparent";
        if (obj.stroke) {
          thumbnail.style.border = `2px solid ${obj.stroke}`;
        }
        thumbnail.style.opacity = obj.opacity;
      } else if (obj.type === "line" || obj.type === "path") {
        thumbnail.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;">
                      <i class="bi bi-pencil"></i>
                  </div>`;
      } else if (obj.type === "i-text") {
        thumbnail.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;">
                      <i class="bi bi-fonts"></i>
                  </div>`;
      } else if (obj.type === "group") {
        thumbnail.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;">
                      <i class="bi bi-collection"></i>
                  </div>`;
      }

      layerItem.appendChild(thumbnail);

      // Nombre de la capa
      const layerName = document.createElement("span");
      layerName.className = "layer-name flex-grow-1";
      layerName.textContent = objectName;
      layerItem.appendChild(layerName);

      // Controles de la capa
      const layerControls = document.createElement("div");
      layerControls.className = "layer-controls d-flex";

      // Botón de visibilidad
      const visibilityBtn = document.createElement("button");
      visibilityBtn.className = "btn btn-sm btn-outline-secondary me-1";
      visibilityBtn.dataset.index = index;
      visibilityBtn.innerHTML =
        obj.visible !== false
          ? '<i class="bi bi-eye"></i>'
          : '<i class="bi bi-eye-slash"></i>';
      visibilityBtn.title = obj.visible !== false ? "Ocultar" : "Mostrar";
      visibilityBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleObjectVisibility(index);
      });
      layerControls.appendChild(visibilityBtn);

      // Botones para mover capa arriba/abajo
      const moveUpBtn = document.createElement("button");
      moveUpBtn.className = "btn btn-sm btn-outline-secondary me-1";
      moveUpBtn.innerHTML = '<i class="bi bi-arrow-up"></i>';
      moveUpBtn.title = "Mover hacia arriba";
      moveUpBtn.disabled = index === 0;
      moveUpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveObjectUp(index);
      });
      layerControls.appendChild(moveUpBtn);

      const moveDownBtn = document.createElement("button");
      moveDownBtn.className = "btn btn-sm btn-outline-secondary me-1";
      moveDownBtn.innerHTML = '<i class="bi bi-arrow-down"></i>';
      moveDownBtn.title = "Mover hacia abajo";
      moveDownBtn.disabled = index === objects.length - 1;
      moveDownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveObjectDown(index);
      });
      layerControls.appendChild(moveDownBtn);

      // Botones para mover capa al frente/fondo (como en Illustrator)
      const moveToFrontBtn = document.createElement("button");
      moveToFrontBtn.className = "btn btn-sm btn-outline-secondary me-1";
      moveToFrontBtn.innerHTML = '<i class="bi bi-front"></i>';
      moveToFrontBtn.title = "Traer al frente";
      moveToFrontBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveObjectToFront(index);
      });
      layerControls.appendChild(moveToFrontBtn);

      const moveToBackBtn = document.createElement("button");
      moveToBackBtn.className = "btn btn-sm btn-outline-secondary me-1";
      moveToBackBtn.innerHTML = '<i class="bi bi-back"></i>';
      moveToBackBtn.title = "Enviar al fondo";
      moveToBackBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveObjectToBack(index);
      });
      layerControls.appendChild(moveToBackBtn);

      // Botón de duplicar
      const duplicateBtn = document.createElement("button");
      duplicateBtn.className = "btn btn-sm btn-outline-secondary me-1";
      duplicateBtn.innerHTML = '<i class="bi bi-files"></i>';
      duplicateBtn.title = "Duplicar";
      duplicateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        duplicateObject(index);
      });
      layerControls.appendChild(duplicateBtn);

      // Botón de eliminar
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-outline-danger";
      deleteBtn.dataset.index = index;
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.title = "Eliminar";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteObject(index);
      });
      layerControls.appendChild(deleteBtn);

      layerItem.appendChild(layerControls);

      // Hacer que el elemento de capa sea clicable para seleccionar el objeto
      layerItem.addEventListener("click", (e) => {
        if (!e.target.closest(".layer-controls")) {
          // Obtener el objeto real del canvas (no el filtrado)
          const allObjects = canvas
            .getObjects()
            .filter((obj) => obj.id !== "grid");
          const realIndex = allObjects.length - 1 - index;
          const obj = allObjects[realIndex];

          if (obj) {
            canvas.setActiveObject(obj);
            canvas.renderAll();
            updateLayersList(); // Actualizar para mostrar la selección
          }
        }
      });

      layersList.appendChild(layerItem);
    });

    // Implementar arrastrar y soltar para reordenar capas
    initDragAndDrop();
  }

  // Inicializar drag and drop para reordenar capas
  function initDragAndDrop() {
    const layersList = document.getElementById("layers-list");
    if (!layersList) return;

    if (typeof Sortable !== "undefined") {
      // Destruir instancia anterior si existe
      const oldSortable = layersList._sortable;
      if (oldSortable) {
        oldSortable.destroy();
      }

      // Crear nueva instancia
      layersList._sortable = new Sortable(layersList, {
        handle: ".drag-handle",
        animation: 150,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        onStart: (evt) => {
          // Añadir clase para indicar que se está arrastrando
          document.body.classList.add("dragging-layer");
        },
        onEnd: (evt) => {
          document.body.classList.remove("dragging-layer");

          // Reordenar objetos en el canvas basado en el nuevo orden de las capas
          const objects = canvas
            .getObjects()
            .filter((obj) => obj.id !== "grid");
          const fromIndex = objects.length - 1 - evt.oldIndex;
          const toIndex = objects.length - 1 - evt.newIndex;

          if (fromIndex !== toIndex) {
            reorderObjects(fromIndex, toIndex);
          }
        },
      });
    } else {
      // Cargar Sortable.js si no está disponible
      loadSortableLibrary()
        .then((sortableLib) => {
          window.Sortable = sortableLib;
          initDragAndDrop();
        })
        .catch((error) => {
          console.warn("No se pudo cargar Sortable.js:", error);
        });
    }
  }

  // Función para cargar dinámicamente la biblioteca Sortable.js
  function loadSortableLibrary() {
    return new Promise((resolve, reject) => {
      // Si Sortable ya está definido, no necesitamos cargarlo de nuevo
      if (typeof Sortable !== "undefined") {
        resolve(Sortable);
        return;
      }

      // Crear elemento script
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js";
      script.async = true;

      // Evento de carga exitosa
      script.onload = () => {
        console.log("Biblioteca Sortable.js cargada correctamente");
        resolve(window.Sortable);
      };

      // Evento de error
      script.onerror = () => {
        console.error("Error al cargar la biblioteca Sortable.js");
        reject(new Error("Error al cargar Sortable.js"));
      };

      // Añadir el script al documento
      document.head.appendChild(script);
    });
  }

  // Reordenar objetos en el canvas
  function reorderObjects(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    // Filtrar objetos para excluir las líneas de la cuadrícula
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    const obj = objects[fromIndex];

    // Eliminar del índice actual
    objects.splice(fromIndex, 1);

    // Insertar en el nuevo índice
    objects.splice(toIndex, 0, obj);

    // Obtener todos los objetos del canvas incluyendo la cuadrícula
    const allObjects = canvas.getObjects();

    // Filtrar las líneas de la cuadrícula
    const gridLines = allObjects.filter((obj) => obj.id === "grid");

    // Actualizar el canvas con los objetos reordenados y las líneas de la cuadrícula al fondo
    canvas._objects = [...gridLines, ...objects];
    canvas.renderAll();
    history.save();
    updateLayersList();
  }

  // Mover objeto hacia arriba en el orden de apilamiento
  function moveObjectUp(index) {
    if (index <= 0) return; // Ya está en la parte superior

    reorderObjects(index, index - 1);
  }

  // Mover objeto hacia abajo en el orden de apilamiento
  function moveObjectDown(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    if (index >= objects.length - 1) return; // Ya está en la parte inferior

    reorderObjects(index, index + 1);
  }

  // Mover objeto al frente (como en Illustrator)
  function moveObjectToFront(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    if (index <= 0) return; // Ya está en la parte superior

    reorderObjects(index, 0);
  }

  // Mover objeto al fondo (como en Illustrator)
  function moveObjectToBack(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    if (index >= objects.length - 1) return; // Ya está en la parte inferior

    reorderObjects(index, objects.length - 1);
  }

  // Toggle visibilidad del objeto
  function toggleObjectVisibility(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    const obj = objects[index];
    obj.visible = !obj.visible;
    canvas.renderAll();
    history.save();
    updateLayersList();
  }

  // Duplicar objeto
  function duplicateObject(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    const obj = objects[index];

    obj.clone((clonedObj) => {
      // Offset ligeramente la posición para distinguirla
      clonedObj.set({
        left: clonedObj.left + 20,
        top: clonedObj.top + 20,
      });

      // Asignar nuevo ID
      assignObjectId(clonedObj);

      canvas.add(clonedObj);
      canvas.setActiveObject(clonedObj);
      canvas.renderAll();
      history.save();
      updateLayersList();
    });
  }

  // Eliminar objeto
  function deleteObject(index) {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    const obj = objects[index];
    canvas.remove(obj);
    history.save();
    updateLayersList();
  }

  // Botones de undo/redo
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      history.undo();
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      history.redo();
    });
  }

  // New canvas button
  if (newCanvasBtn) {
    newCanvasBtn.addEventListener("click", () => {
      if (
        confirm(
          "¿Está seguro de que desea crear un nuevo lienzo? Se perderán todos los cambios no guardados."
        )
      ) {
        canvas.clear();
        canvas.backgroundColor = "#ffffff";
        canvas.renderAll();
        objectCounter = 0;
        history.stack = [];
        history.currentIndex = -1;
        history.save(); // Guardar el lienzo vacío
        updateLayersList();
      }
    });
  }

  // Delete selected button
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", () => {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.remove(activeObject);
        history.save();
      }
    });
  }

  // Export SVG button
  if (exportSvgBtn) {
    exportSvgBtn.addEventListener("click", () => {
      const svgData = canvas.toSVG();
      if (exportCode) exportCode.value = svgData;
      if (exportPreview) exportPreview.innerHTML = svgData;
      if (document.getElementById("exportModalLabel"))
        document.getElementById("exportModalLabel").textContent =
          "Exportar SVG";
      if (exportFilename) exportFilename.value = "mi-diseño.svg";
      if (exportModal) exportModal.show();
    });
  }

  // Export PNG button
  if (exportPngBtn) {
    exportPngBtn.addEventListener("click", () => {
      const pngData = canvas.toDataURL({
        format: "png",
        quality: 1,
      });

      if (exportCode)
        exportCode.value = "Los datos PNG no se pueden mostrar como texto.";
      if (exportPreview)
        exportPreview.innerHTML = `<img src="${pngData}" style="max-width: 100%; max-height: 200px;">`;
      if (document.getElementById("exportModalLabel"))
        document.getElementById("exportModalLabel").textContent =
          "Exportar PNG";
      if (exportFilename) exportFilename.value = "mi-diseño.png";
      if (exportModal) exportModal.show();
    });
  }

  // Export JPG button
  if (exportJpgBtn) {
    exportJpgBtn.addEventListener("click", () => {
      const jpgData = canvas.toDataURL({
        format: "jpeg",
        quality: 0.8,
      });

      if (exportCode)
        exportCode.value = "Los datos JPG no se pueden mostrar como texto.";
      if (exportPreview)
        exportPreview.innerHTML = `<img src="${jpgData}" style="max-width: 100%; max-height: 200px;">`;
      if (document.getElementById("exportModalLabel"))
        document.getElementById("exportModalLabel").textContent =
          "Exportar JPG";
      if (exportFilename) exportFilename.value = "mi-diseño.jpg";
      if (exportModal) exportModal.show();
    });
  }

  // Download export button
  if (downloadExportBtn) {
    downloadExportBtn.addEventListener("click", () => {
      if (!exportFilename) return;

      const filename = exportFilename.value;
      const modalLabel = document.getElementById("exportModalLabel");
      const modalTitle = modalLabel ? modalLabel.textContent : "";

      let dataUrl, mimeType;

      if (modalTitle === "Exportar SVG") {
        const svgData = canvas.toSVG();
        const blob = new Blob([svgData], { type: "image/svg+xml" });
        dataUrl = URL.createObjectURL(blob);
        mimeType = "image/svg+xml";
      } else if (modalTitle === "Exportar PNG") {
        dataUrl = canvas.toDataURL({
          format: "png",
          quality: 1,
        });
        mimeType = "image/png";
      } else if (modalTitle === "Exportar JPG") {
        dataUrl = canvas.toDataURL({
          format: "jpeg",
          quality: 0.8,
        });
        mimeType = "image/jpeg";
      }

      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Ignorar atajos si el foco está en un campo de entrada o está modificándose texto
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      (canvas.getActiveObject() && canvas.getActiveObject().isEditing)
    ) {
      return;
    }

    // Delete key to remove selected object
    if (e.key === "Delete" || e.key === "Backspace") {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.remove(activeObject);
        history.save();
        e.preventDefault();
      }
    }

    // Ctrl+Z para deshacer
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      history.undo();
      e.preventDefault();
    }

    // Ctrl+Y o Ctrl+Shift+Z para rehacer
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "y" || (e.shiftKey && e.key === "z"))
    ) {
      history.redo();
      e.preventDefault();
    }

    // Ctrl+C para copiar
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      copySelectedObject();
      e.preventDefault();
    }

    // Ctrl+V para pegar
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      pasteObject();
      e.preventDefault();
    }

    // Ctrl+D para duplicar
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      duplicateSelectedObject();
      e.preventDefault();
    }

    // Escape para deseleccionar
    if (e.key === "Escape") {
      canvas.discardActiveObject();
      canvas.renderAll();
      e.preventDefault();
    }

    // Teclas de flecha para mover objetos seleccionados
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        const movementDelta = e.shiftKey ? 10 : 1;

        switch (e.key) {
          case "ArrowUp":
            activeObject.top -= movementDelta;
            break;
          case "ArrowDown":
            activeObject.top += movementDelta;
            break;
          case "ArrowLeft":
            activeObject.left -= movementDelta;
            break;
          case "ArrowRight":
            activeObject.left += movementDelta;
            break;
        }

        activeObject.setCoords();
        canvas.renderAll();

        // Evitar guardar en historial con cada pulsación
        clearTimeout(window.moveTimeout);
        window.moveTimeout = setTimeout(() => {
          history.save();
        }, 300);

        e.preventDefault();
      }
    }
  });

  // Copiar objetos seleccionados
  let clipboard = null;

  function copySelectedObject() {
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone((cloned) => {
        clipboard = cloned;
      });
    }
  }

  // Pegar objeto del portapapeles
  function pasteObject() {
    if (clipboard) {
      clipboard.clone((clonedObj) => {
        // Offset la posición para distinguirla
        clonedObj.set({
          left: clonedObj.left + 20,
          top: clonedObj.top + 20,
        });

        // Asignar nuevo ID
        assignObjectId(clonedObj);

        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
        canvas.renderAll();
        history.save();
        updateLayersList();
      });
    }
  }

  // Duplicar objeto seleccionado
  function duplicateSelectedObject() {
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone((clonedObj) => {
        // Offset la posición para distinguirla
        clonedObj.set({
          left: clonedObj.left + 20,
          top: clonedObj.top + 20,
        });

        // Asignar nuevo ID
        assignObjectId(clonedObj);

        canvas.add(clonedObj);
        canvas.setActiveObject(clonedObj);
        canvas.renderAll();
        history.save();
        updateLayersList();
      });
    }
  }

  // Configuración del área de trabajo y controles de tamaño del canvas
  function setupWorkspaceLayout() {
    // Obtener los contenedores
    const editorContainer = document.getElementById("editor-container");
    const canvasWrapper = document.querySelector(".canvas-wrapper");

    if (!editorContainer || !canvasWrapper) {
      console.warn(
        "No se encontraron los contenedores necesarios para el área de trabajo"
      );
      return;
    }

    // Crear el panel de control de tamaño
    const canvasSizeControls = document.createElement("div");
    canvasSizeControls.id = "canvas-size-controls";
    canvasSizeControls.className =
      "canvas-size-controls mb-3 p-3 border rounded bg-light";

    // Añadir controles de tamaño
    canvasSizeControls.innerHTML = `
              <div class="d-flex justify-content-between align-items-center mb-2">
                  <h6 class="mb-0">Tamaño del Canvas</h6>
                  <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="transparent-bg">
                      <label class="form-check-label" for="transparent-bg">Fondo transparente</label>
                  </div>
              </div>
              <div class="d-flex align-items-center mb-2">
                  <label for="canvas-width" class="me-2">Ancho:</label>
                  <input type="number" id="canvas-width" class="form-control form-control-sm me-2" min="100" max="3000" value="${canvas.width}">
                  <label for="canvas-height" class="me-2">Alto:</label>
                  <input type="number" id="canvas-height" class="form-control form-control-sm me-2" min="100" max="3000" value="${canvas.height}">
                  <button id="apply-canvas-size" class="btn btn-sm btn-primary">Aplicar</button>
              </div>
              <div class="d-flex flex-wrap">
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="800" data-height="600">800×600</button>
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="1024" data-height="768">1024×768</button>
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="1280" data-height="720">1280×720 (HD)</button>
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="1920" data-height="1080">1920×1080 (Full HD)</button>
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="500" data-height="500">500×500</button>
                  <button class="btn btn-sm btn-outline-secondary me-1 mb-1" data-width="1000" data-height="1000">1000×1000</button>
              </div>
              <div class="d-flex justify-content-between mt-2">
                  <div class="btn-group">
                      <button id="toggle-grid" class="btn btn-sm btn-outline-secondary" title="Mostrar/ocultar cuadrícula">
                          <i class="bi bi-grid-3x3"></i> Cuadrícula
                      </button>
                      <button id="toggle-snap" class="btn btn-sm btn-outline-secondary" title="Activar/desactivar ajuste a cuadrícula">
                          <i class="bi bi-magnet"></i> Ajustar
                      </button>
                  </div>
                  <div class="btn-group">
                      <button id="center-objects" class="btn btn-sm btn-outline-secondary" title="Centrar objetos seleccionados">
                          <i class="bi bi-arrows-move"></i> Centrar
                      </button>
                      <button id="center-canvas" class="btn btn-sm btn-outline-secondary" title="Centrar canvas en el objeto">
                          <i class="bi bi-bullseye"></i> Enfocar
                      </button>
                  </div>
              </div>
          `;

    // Insertar el panel al principio del contenedor del editor
    editorContainer.insertBefore(canvasSizeControls, canvasWrapper);

    // Añadir eventos a los controles
    const widthInput = document.getElementById("canvas-width");
    const heightInput = document.getElementById("canvas-height");
    const applyBtn = document.getElementById("apply-canvas-size");
    const transparentBgCheck = document.getElementById("transparent-bg");
    const toggleGridBtn = document.getElementById("toggle-grid");
    const toggleSnapBtn = document.getElementById("toggle-snap");
    const centerObjectsBtn = document.getElementById("center-objects");
    const centerCanvasBtn = document.getElementById("center-canvas");

    // Evento para aplicar el tamaño personalizado
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        if (!widthInput || !heightInput) return;

        const newWidth = Number.parseInt(widthInput.value, 10);
        const newHeight = Number.parseInt(heightInput.value, 10);

        if (
          newWidth >= 100 &&
          newWidth <= 3000 &&
          newHeight >= 100 &&
          newHeight <= 3000
        ) {
          changeCanvasSize(newWidth, newHeight);
        } else {
          alert(
            "Por favor, ingrese dimensiones válidas (entre 100 y 3000 píxeles)."
          );
        }
      });
    }

    // Eventos para los botones de tamaños predefinidos
    const presetButtons = canvasSizeControls.querySelectorAll(
      "button[data-width][data-height]"
    );
    presetButtons.forEach((button) => {
      button.addEventListener("click", function () {
        if (!widthInput || !heightInput) return;

        const width = Number.parseInt(this.dataset.width, 10);
        const height = Number.parseInt(this.dataset.height, 10);

        widthInput.value = width;
        heightInput.value = height;
        changeCanvasSize(width, height);
      });
    });

    // Evento para cambiar el fondo transparente
    if (transparentBgCheck) {
      transparentBgCheck.addEventListener("change", function () {
        if (this.checked) {
          canvas.backgroundColor = "transparent";
        } else {
          canvas.backgroundColor = "#ffffff";
        }
        canvas.renderAll();
        history.save();
      });
    }

    // Evento para mostrar/ocultar cuadrícula
    if (toggleGridBtn) {
      toggleGridBtn.addEventListener("click", function () {
        showGrid = !showGrid;
        this.classList.toggle("active", showGrid);
        drawGrid();
      });
    }

    // Evento para activar/desactivar ajuste a cuadrícula
    if (toggleSnapBtn) {
      toggleSnapBtn.addEventListener("click", function () {
        snapToGrid = !snapToGrid;
        this.classList.toggle("active", snapToGrid);

        // Si se activa el ajuste a cuadrícula, asegurarse de que la cuadrícula sea visible
        if (snapToGrid && !showGrid && toggleGridBtn) {
          showGrid = true;
          toggleGridBtn.classList.add("active");
          drawGrid();
        }
      });
    }

    // Evento para centrar objetos seleccionados
    if (centerObjectsBtn) {
      centerObjectsBtn.addEventListener("click", function () {
        centerSelectedObjects();
      });
    }

    // Evento para centrar canvas en el objeto seleccionado
    if (centerCanvasBtn) {
      centerCanvasBtn.addEventListener("click", function () {
        centerCanvasOnSelection();
      });
    }
  }

  // Función para cambiar el tamaño del canvas manteniendo el contenido
  function changeCanvasSize(width, height) {
    // Guardar el estado actual para el historial
    history.save();

    // Cambiar dimensiones del canvas
    canvas.setWidth(width);
    canvas.setHeight(height);

    // Actualizar los inputs
    const widthInput = document.getElementById("canvas-width");
    const heightInput = document.getElementById("canvas-height");

    if (widthInput) widthInput.value = width;
    if (heightInput) heightInput.value = height;

    // Renderizar el canvas
    canvas.renderAll();

    // Redibujar la cuadrícula si está visible
    if (showGrid) {
      drawGrid();
    }

    // Guardar el nuevo estado en el historial
    history.save();
  }

  // Función para dibujar la cuadrícula
  function drawGrid() {
    // Eliminar cuadrícula existente
    const existingGrid = canvas.getObjects().filter((obj) => obj.id === "grid");
    existingGrid.forEach((obj) => canvas.remove(obj));

    if (!showGrid) {
      canvas.renderAll();
      return;
    }

    // Crear líneas de cuadrícula
    const gridLines = [];

    // Líneas verticales
    for (let i = 0; i <= canvas.width; i += gridSize) {
      gridLines.push(
        new fabric.Line([i, 0, i, canvas.height], {
          stroke: "#ddd",
          selectable: false,
          evented: false,
          id: "grid",
        })
      );
    }

    // Líneas horizontales
    for (let i = 0; i <= canvas.height; i += gridSize) {
      gridLines.push(
        new fabric.Line([0, i, canvas.width, i], {
          stroke: "#ddd",
          selectable: false,
          evented: false,
          id: "grid",
        })
      );
    }

    // Añadir líneas al canvas
    canvas.add(...gridLines);

    // Mover cuadrícula al fondo
    gridLines.forEach((line) => {
      canvas.sendToBack(line);
    });

    canvas.renderAll();
  }

  // Función para centrar objetos seleccionados en el canvas
  function centerSelectedObjects() {
    const activeObject = canvas.getActiveObject();
    if (!activeObject) {
      alert("Seleccione al menos un objeto para centrar");
      return;
    }

    // Centrar horizontalmente
    activeObject.centerH();

    // Centrar verticalmente
    activeObject.centerV();

    activeObject.setCoords();
    canvas.renderAll();
    history.save();
  }

  // Función para centrar el canvas en el objeto seleccionado
  function centerCanvasOnSelection() {
    const activeObject = canvas.getActiveObject();
    if (!activeObject) {
      alert("Seleccione un objeto para enfocar");
      return;
    }

    // Obtener el centro del objeto
    const objectCenter = activeObject.getCenterPoint();

    // Obtener el contenedor del canvas
    const canvasWrapper = document.querySelector(".canvas-wrapper");
    if (!canvasWrapper) return;

    // Calcular el desplazamiento para centrar el objeto
    const scrollLeft = objectCenter.x - canvasWrapper.clientWidth / 2;
    const scrollTop = objectCenter.y - canvasWrapper.clientHeight / 2;

    // Aplicar desplazamiento con animación suave
    canvasWrapper.scrollTo({
      left: scrollLeft,
      top: scrollTop,
      behavior: "smooth",
    });
  }

  // Añadir estilos CSS para mejorar la apariencia
  function addCustomStyles() {
    if (document.getElementById("custom-editor-styles")) return;

    const styleElement = document.createElement("style");
    styleElement.id = "custom-editor-styles";
    styleElement.textContent = `
              .canvas-container {
                  margin: 0 auto;
                  box-shadow: 0 0 10px rgba(0,0,0,0.1);
                  background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAyMCAwIEwgMCAwIDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2YwZjBmMCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+');
                  display: block !important;
                  visibility: visible !important;
                  position: relative !important;
                  z-index: 1;
              }
              
              .canvas-wrapper {
                  min-height: 600px;
                  border: 1px solid #ddd;
                  border-radius: 4px;
                  background-color: #f8f8f8;
                  display: block !important;
                  visibility: visible !important;
                  position: relative !important;
                  overflow: auto !important;
              }
              
              .canvas-size-controls {
                  background-color: #f8f9fa;
                  border-radius: 4px;
                  display: block !important;
                  visibility: visible !important;
              }
              
              .canvas-size-controls button {
                  font-size: 0.8rem;
              }
              
              .layer-item {
                  transition: background-color 0.2s;
                  border-left: 3px solid transparent;
                  cursor: pointer;
              }
              
              .layer-item:hover {
                  background-color: #f8f9fa;
              }
              
              .layer-item.active {
                  border-left-color: #0d6efd;
              }
              
              .layer-controls {
                  opacity: 0.7;
                  transition: opacity 0.2s;
              }
              
              .layer-item:hover .layer-controls {
                  opacity: 1;
              }
              
              .sortable-ghost {
                  background-color: #e9ecef;
                  opacity: 0.8;
              }
              
              .sortable-chosen {
                  background-color: #e9ecef;
              }
              
              .cursor-move {
                  cursor: move;
              }
              
              .dragging-layer .layer-item:not(.sortable-ghost):hover {
                  background-color: #e9ecef;
              }
              
              #canvas {
                  display: block !important;
                  visibility: visible !important;
              }
  
              .editor-container {
                  display: flex;
                  flex-direction: column;
                  height: calc(100vh - 150px);
                  min-height: 600px;
                  overflow: hidden;
                  position: relative;
              }
          `;

    document.head.appendChild(styleElement);
  }

  // Añade esta función a tu script.js para implementar la carga de archivos
  function implementFileUpload() {
    const editorContainer = document.getElementById("herramientas");
    if (!editorContainer) return;

    // Crear el contenedor para los botones de carga
    const uploadContainer = document.createElement("div");
    uploadContainer.id = "upload-container";
    uploadContainer.className = "mb-3 p-3 border rounded bg-light";

    // Añadir el HTML para los botones de carga
    uploadContainer.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">Importar archivos</h6>
      </div>
      <div class="d-flex flex-wrap">
        <div class="me-2 mb-2">
          <input type="file" id="upload-svg" accept=".svg" style="display: none;">
          <button id="upload-svg-btn" class="btn btn-outline-primary">
            <i class="bi bi-file-earmark-code"></i> Cargar SVG
          </button>
        </div>
        <div class="me-2 mb-2">
          <input type="file" id="upload-image" accept="image/*" style="display: none;">
          <button id="upload-image-btn" class="btn btn-outline-primary">
            <i class="bi bi-file-earmark-image"></i> Cargar Imagen
          </button>
        </div>
      </div>
      <div id="upload-status" class="mt-2 small text-muted"></div>
    `;

    // Insertar el contenedor al principio del editor
    editorContainer.prepend(uploadContainer);

    // Añadir eventos a los botones
    const uploadSvgBtn = document.getElementById("upload-svg-btn");
    const uploadImageBtn = document.getElementById("upload-image-btn");
    const uploadSvgInput = document.getElementById("upload-svg");
    const uploadImageInput = document.getElementById("upload-image");
    const uploadStatus = document.getElementById("upload-status");

    // Evento para el botón de cargar SVG
    if (uploadSvgBtn && uploadSvgInput) {
      uploadSvgBtn.addEventListener("click", () => {
        uploadSvgInput.click();
      });

      uploadSvgInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.textContent = `Cargando SVG: ${file.name}...`;

        const reader = new FileReader();
        reader.onload = function (event) {
          const svgData = event.target.result;

          // Cargar SVG en el canvas
          fabric.loadSVGFromString(svgData, function (objects, options) {
            const svgGroup = fabric.util.groupSVGElements(objects, options);

            // Ajustar tamaño si es necesario
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;

            if (
              svgGroup.width > canvasWidth ||
              svgGroup.height > canvasHeight
            ) {
              const scale =
                Math.min(
                  canvasWidth / svgGroup.width,
                  canvasHeight / svgGroup.height
                ) * 0.8; // 80% del tamaño máximo para dejar margen

              svgGroup.scale(scale);
            }

            // Centrar en el canvas
            svgGroup.set({
              left: canvasWidth / 2,
              top: canvasHeight / 2,
              originX: "center",
              originY: "center",
            });

            // Asignar ID y añadir al canvas
            assignObjectId(svgGroup);
            canvas.add(svgGroup);
            canvas.setActiveObject(svgGroup);
            canvas.renderAll();

            // Guardar en historial
            history.save();
            updateLayersList();

            uploadStatus.textContent = `SVG cargado correctamente: ${file.name}`;
            setTimeout(() => {
              uploadStatus.textContent = "";
            }, 3000);
          });
        };

        reader.onerror = function () {
          uploadStatus.textContent = `Error al cargar el archivo SVG: ${file.name}`;
        };

        reader.readAsText(file);

        // Limpiar el input para permitir cargar el mismo archivo nuevamente
        e.target.value = "";
      });
    }

    // Evento para el botón de cargar imagen
    if (uploadImageBtn && uploadImageInput) {
      uploadImageBtn.addEventListener("click", () => {
        uploadImageInput.click();
      });

      uploadImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.textContent = `Cargando imagen: ${file.name}...`;

        const reader = new FileReader();
        reader.onload = function (event) {
          const imgData = event.target.result;

          fabric.Image.fromURL(imgData, function (img) {
            // Ajustar tamaño si es necesario
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;

            if (img.width > canvasWidth || img.height > canvasHeight) {
              const scale =
                Math.min(canvasWidth / img.width, canvasHeight / img.height) *
                0.8; // 80% del tamaño máximo para dejar margen

              img.scale(scale);
            }

            // Centrar en el canvas
            img.set({
              left: canvasWidth / 2,
              top: canvasHeight / 2,
              originX: "center",
              originY: "center",
            });

            // Asignar ID y añadir al canvas
            assignObjectId(img);
            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();

            // Guardar en historial
            history.save();
            updateLayersList();

            uploadStatus.textContent = `Imagen cargada correctamente: ${file.name}`;
            setTimeout(() => {
              uploadStatus.textContent = "";
            }, 3000);
          });
        };

        reader.onerror = function () {
          uploadStatus.textContent = `Error al cargar la imagen: ${file.name}`;
        };

        reader.readAsDataURL(file);

        // Limpiar el input para permitir cargar el mismo archivo nuevamente
        e.target.value = "";
      });
    }
  }

  // Función corregida para añadir botones de gestión de capas
  function addLayerManagementButtons() {
    const layersPanel = document.querySelector(".layers-panel");
    if (!layersPanel) return;

    // Verificar si ya existe el contenedor de botones
    if (document.getElementById("layer-management-buttons")) return;

    // Verificar si existe la lista de capas
    const layersList = layersPanel.querySelector("#layers-list");
    if (!layersList) return;

    // Crear el contenedor de botones
    const buttonContainer = document.createElement("div");
    buttonContainer.id = "layer-management-buttons";
    buttonContainer.className = "btn-group w-100 mb-2";
    buttonContainer.innerHTML = `
                <button id="select-all-layers" class="btn btn-sm btn-outline-secondary" title="Seleccionar todo">
                    <i class="bi bi-check-all"></i> Seleccionar todo
                </button>
                <button id="group-layers" class="btn btn-sm btn-outline-secondary" title="Agrupar seleccionados">
                    <i class="bi bi-collection"></i> Agrupar
                </button>
                <button id="ungroup-layers" class="btn btn-sm btn-outline-secondary" title="Desagrupar">
                    <i class="bi bi-grid-3x3"></i> Desagrupar
                </button>
            `;

    // Insertar al principio del panel de capas
    layersPanel.prepend(buttonContainer);

    // Añadir eventos a los botones solo si las funciones existen
    const selectAllBtn = document.getElementById("select-all-layers");
    const groupBtn = document.getElementById("group-layers");
    const ungroupBtn = document.getElementById("ungroup-layers");

    // Verificar si las funciones existen antes de asignarlas
    if (selectAllBtn && typeof window.selectAllObjects === "function") {
      selectAllBtn.addEventListener("click", window.selectAllObjects);
    } else if (selectAllBtn) {
      // Implementación alternativa si la función no existe
      selectAllBtn.addEventListener("click", function () {
        const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
        if (objects.length === 0) return;

        const selection = new fabric.ActiveSelection(objects, {
          canvas: canvas,
        });

        canvas.setActiveObject(selection);
        canvas.renderAll();
        updateLayersList();
      });
    }

    if (groupBtn && typeof window.groupSelectedObjects === "function") {
      groupBtn.addEventListener("click", window.groupSelectedObjects);
    } else if (groupBtn) {
      // Implementación alternativa
      groupBtn.addEventListener("click", function () {
        const activeObject = canvas.getActiveObject();
        if (
          !activeObject ||
          !activeObject.type ||
          activeObject.type !== "activeSelection"
        ) {
          alert("Seleccione múltiples objetos para agrupar");
          return;
        }

        const group = activeObject.toGroup();
        assignObjectId(group);
        group.name = "Grupo " + objectCounter;

        canvas.renderAll();
        history.save();
        updateLayersList();
      });
    }

    if (ungroupBtn && typeof window.ungroupSelectedObject === "function") {
      ungroupBtn.addEventListener("click", window.ungroupSelectedObject);
    } else if (ungroupBtn) {
      // Implementación alternativa
      ungroupBtn.addEventListener("click", function () {
        const activeObject = canvas.getActiveObject();
        if (!activeObject || activeObject.type !== "group") {
          alert("Seleccione un grupo para desagrupar");
          return;
        }

        const items = activeObject.getObjects();
        activeObject.destroy();
        canvas.remove(activeObject);

        canvas.add(...items);

        canvas.renderAll();
        history.save();
        updateLayersList();
      });
    }
  }

  // Seleccionar todos los objetos
  function selectAllObjects() {
    const objects = canvas.getObjects().filter((obj) => obj.id !== "grid");
    if (objects.length === 0) return;

    const selection = new fabric.ActiveSelection(objects, {
      canvas: canvas,
    });

    canvas.setActiveObject(selection);
    canvas.renderAll();
    updateLayersList();
  }

  // Desagrupar objeto seleccionado
  function ungroupSelectedObject() {
    const activeObject = canvas.getActiveObject();
    if (!activeObject || activeObject.type !== "group") {
      alert("Seleccione un grupo para desagrupar");
      return;
    }

    const items = activeObject.getObjects();
    activeObject.destroy();
    canvas.remove(activeObject);

    canvas.add(...items);

    canvas.renderAll();
    history.save();
    updateLayersList();
  }

  // Inicialización final
  function initializeApp() {
    // Añadir estilos
    addCustomStyles();

    // Configurar el área de trabajo
    setupWorkspaceLayout();

    // Implementar carga de archivos
    implementFileUpload();

    // Iniciar primera entrada en el historial
    history.save();

    // Inicializar capas
    updateLayersList();

    // Añadir botones de gestión de capas
    try {
      // Verificar si existe el panel de capas antes de intentar añadir los botones
      const layersPanel = document.querySelector(".layers-panel");
      if (layersPanel && layersPanel.querySelector("#layers-list")) {
        addLayerManagementButtons();
      }
    } catch (error) {
      console.warn("Error al añadir botones de gestión de capas:", error);
    }

    // Configurar tooltips
    const tooltipTriggerList = [].slice.call(
      document.querySelectorAll("[title]")
    );
    tooltipTriggerList.map((tooltipTriggerEl) => {
      if (typeof bootstrap !== "undefined" && bootstrap.Tooltip) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
          delay: { show: 500, hide: 100 },
        });
      }
      return null;
    });

    console.log("Editor inicializado correctamente");
  }

  // Iniciar la aplicación
  initializeApp();

  // Asegurarse de que el canvas sea visible después de que la página se cargue completamente
  window.addEventListener("load", () => {
    // Forzar la visibilidad del canvas y sus contenedores
    const canvasWrapper = document.querySelector(".canvas-wrapper");
    const canvasContainer = document.querySelector(".canvas-container");
    const canvasElement = document.getElementById("canvas");

    if (canvasWrapper) {
      canvasWrapper.style.display = "block";
      canvasWrapper.style.visibility = "visible";
      canvasWrapper.style.overflow = "auto";
    }

    if (canvasContainer) {
      canvasContainer.style.display = "block";
      canvasContainer.style.visibility = "visible";
      canvasContainer.style.position = "relative";
      canvasContainer.style.zIndex = "1";
    }

    if (canvasElement) {
      canvasElement.style.display = "block";
      canvasElement.style.visibility = "visible";
    }

    // Renderizar el canvas para asegurarse de que se muestre
    canvas.renderAll();
  });
});
