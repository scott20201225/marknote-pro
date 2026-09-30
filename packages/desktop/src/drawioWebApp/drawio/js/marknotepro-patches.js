/*
 * MarkNotePro integration compatibility patches.
 *
 * This file is deliberately loaded outside app.min.js. It keeps the local
 * editor usable while the upstream compressed extension bundle is refreshed.
 */
(function () {
	function getMarkNoteProThemeColors() {
		if (typeof urlParams === 'undefined' || urlParams.marknoteproThemeColors == null) return null;

		try {
			var colors = JSON.parse(decodeURIComponent(urlParams.marknoteproThemeColors));
			return colors != null && typeof colors === 'object' ? colors : null;
		}
		catch (e) {
			return null;
		}
	}

	function getMarkNoteProThemeColor(colors, name, fallback) {
		var value = colors != null ? colors[name] : null;

		// Theme values originate from MarkNotePro's computed CSS variables. Keep
		// the embedded editor defensive when a handcrafted file URL is opened.
		return (typeof value === 'string' && value.length < 160 && !/[<>{};]/.test(value)) ? value : fallback;
	}

	function clampChannel(v) {
		return Math.max(0, Math.min(255, Math.round(v)));
	}

	function toHexColor(c) {
		var h = function (v) {
			var s = clampChannel(v).toString(16);
			return s.length < 2 ? '0' + s : s;
		};
		return '#' + h(c.r) + h(c.g) + h(c.b);
	}

	function parseRgbColor(str, fallback) {
		if (typeof str !== 'string') return fallback;
		var s = str.trim();
		var hexMatch = /^#([0-9a-fA-F]{3,8})$/.exec(s);
		if (hexMatch) {
			var hex = hexMatch[1];
			if (hex.length === 3 || hex.length === 4) {
				hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
			}
			return {
				r: parseInt(hex.substring(0, 2), 16),
				g: parseInt(hex.substring(2, 4), 16),
				b: parseInt(hex.substring(4, 6), 16)
			};
		}
		var rgbMatch = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(s);
		if (rgbMatch) {
			return {
				r: clampChannel(parseFloat(rgbMatch[1])),
				g: clampChannel(parseFloat(rgbMatch[2])),
				b: clampChannel(parseFloat(rgbMatch[3]))
			};
		}
		return fallback;
	}

	function mixRgbColor(c1, c2, weight) {
		return {
			r: c1.r * (1 - weight) + c2.r * weight,
			g: c1.g * (1 - weight) + c2.g * weight,
			b: c1.b * (1 - weight) + c2.b * weight
		};
	}

	function applyMarkNoteProTheme(graph) {
		var colors = getMarkNoteProThemeColors();
		if (colors == null) return;

		var isDark = (typeof urlParams !== 'undefined' && urlParams.dark === '1') ||
			(typeof Editor !== 'undefined' && typeof Editor.isDarkMode === 'function' && Editor.isDarkMode());

		var panel = getMarkNoteProThemeColor(colors, 'sideBarBgColor', '#f1f3f4');
		var toolbar = getMarkNoteProThemeColor(colors, 'itemBgColor', panel);
		var workspace = getMarkNoteProThemeColor(colors, 'editorBgColor', '#ffffff');
		var dialog = getMarkNoteProThemeColor(colors, 'floatBgColor', toolbar);
		var field = getMarkNoteProThemeColor(colors, 'inputBgColor', dialog);
		var text = getMarkNoteProThemeColor(colors, 'editorColor', '#3f3f3f');
		var border = getMarkNoteProThemeColor(colors, 'tableBorderColor', '#dadada');
		var hover = getMarkNoteProThemeColor(colors, 'floatHoverColor', '#e2e2e2');
		var selected = getMarkNoteProThemeColor(colors, 'themeColor20', hover);
		var selectedHover = getMarkNoteProThemeColor(colors, 'themeColor30', selected);
		var accent = getMarkNoteProThemeColor(colors, 'themeColor', '#0071e3');

		var workspaceRgb = parseRgbColor(workspace, isDark ? { r: 30, g: 30, b: 34 } : { r: 255, g: 255, b: 255 });
		var panelRgb = parseRgbColor(panel, isDark ? { r: 24, g: 24, b: 28 } : { r: 241, g: 243, b: 244 });
		var textRgb = parseRgbColor(text, isDark ? { r: 220, g: 223, b: 230 } : { r: 63, g: 63, b: 63 });
		var borderRgb = parseRgbColor(border, mixRgbColor(workspaceRgb, textRgb, isDark ? 0.22 : 0.16));

		var pageBgHex = toHexColor(workspaceRgb);
		var surroundBgHex = toHexColor(panelRgb);
		var pageBorderHex = toHexColor(borderRgb);
		var gridHex = toHexColor(
			mixRgbColor(
				workspaceRgb,
				isDark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 },
				isDark ? 0.16 : 0.10
			)
		);

		var style = document.getElementById('marknotepro-theme-variables');

		if (style == null) {
			style = document.createElement('style');
			style.id = 'marknotepro-theme-variables';
			document.head.appendChild(style);
		}

		// Draw.io resolves its UI through light-dark() pairs. Both values receive
		// the MarkNotePro palette; the regular dark-mode flag still controls its
		// dark-specific icons, grid behaviour and dialog variants.
		style.textContent = ':root{' +
			'--ge-panel-color:' + panel + ';--ge-dark-panel-color:' + panel + ';' +
			'--toolbar-color:' + toolbar + ';--dark-toolbar-color:' + toolbar + ';' +
			'--workspace-color:' + surroundBgHex + ';--dark-workspace-color:' + surroundBgHex + ';' +
			'--dark-color:' + pageBgHex + ';--ge-dark-color:' + pageBgHex + ';' +
			'--dialog-color:' + dialog + ';--dark-dialog-color:' + dialog + ';' +
			'--field-color:' + field + ';--dark-field-color:' + field + ';' +
			'--card-color:' + toolbar + ';--dark-card-color:' + toolbar + ';' +
			'--soft-color:' + hover + ';--dark-soft-color:' + hover + ';' +
			'--soft-hover-color:' + hover + ';--dark-soft-hover-color:' + hover + ';' +
			'--text-color:' + text + ';--dark-text-color:' + text + ';' +
			'--strong-text-color:' + text + ';--dark-strong-text-color:' + text + ';' +
			'--secondary-text-color:' + text + ';--dark-secondary-text-color:' + text + ';' +
			'--border-color:' + border + ';--dark-border-color:' + border + ';' +
			'--field-border-color:' + border + ';--dark-field-border-color:' + border + ';' +
			'--strong-border-color:' + border + ';--dark-strong-border-color:' + border + ';' +
			'--highlight-color:' + hover + ';--dark-highlight-color:' + hover + ';' +
			'--scrollbar-color:' + hover + ';--dark-scrollbar-color:' + hover + ';' +
			'--primary-color:' + selected + ';--primary-hover-color:' + selectedHover + ';' +
			'--accent-color:' + selected + ';--dark-accent-color:' + selected + ';' +
			'--accent-hover-color:' + selectedHover + ';--dark-active-accent-color:' + selectedHover + ';' +
			'--accent-text-color:' + accent + ';--dark-accent-text-color:' + accent + ';' +
			'--focus-color:' + accent + ';--dark-focus-color:' + accent + ';' +
		'}' +
		'.geDiagramContainer{background-color:' + surroundBgHex + ' !important;}' +
		'.geBackgroundPage{border-color:' + pageBorderHex + ' !important;box-shadow:0 2px 10px rgba(0,0,0,0.18) !important;}' +
		'.geRuler{background:' + pageBgHex + ' !important;}';

		var lightDarkPageBg = 'light-dark(' + pageBgHex + ', ' + pageBgHex + ')';
		var lightDarkPageBorder = 'light-dark(' + pageBorderHex + ', ' + pageBorderHex + ')';
		var lightDarkGrid = 'light-dark(' + gridHex + ', ' + gridHex + ')';

		if (typeof Editor !== 'undefined') {
			Editor.pageBackgroundColor = pageBgHex;
			Editor.darkColor = pageBgHex;
			Editor.darkPageBackgroundColor = pageBgHex;
		}

		if (typeof Graph !== 'undefined' && Graph.prototype != null) {
			Graph.prototype.defaultPageBackgroundColor =
				(typeof urlParams !== 'undefined' && urlParams.embedInline === '1')
					? 'transparent'
					: lightDarkPageBg;
			Graph.prototype.defaultPageBorderColor = lightDarkPageBorder;
			Graph.prototype.shapeBackgroundColor = lightDarkPageBg;
			Graph.prototype.diagramBackgroundColor = surroundBgHex;
		}

		if (typeof mxGraphView !== 'undefined' && mxGraphView.prototype != null) {
			mxGraphView.prototype.defaultGridColor = gridHex;
			mxGraphView.prototype.defaultDarkGridColor = gridHex;
			mxGraphView.prototype.gridColor = lightDarkGrid;
		}

		if (typeof mxSettings !== 'undefined' && mxSettings.settings != null) {
			mxSettings.settings.gridColor = gridHex;
			mxSettings.settings.darkGridColor = gridHex;
		}

		if (graph != null) {
			graph.defaultPageBackgroundColor =
				(typeof urlParams !== 'undefined' && urlParams.embedInline === '1')
					? 'transparent'
					: lightDarkPageBg;
			graph.defaultPageBorderColor = lightDarkPageBorder;
			graph.shapeBackgroundColor = lightDarkPageBg;
			graph.diagramBackgroundColor = surroundBgHex;
			if (graph.view != null) {
				graph.view.defaultGridColor = gridHex;
				graph.view.defaultDarkGridColor = gridHex;
				graph.view.gridColor = lightDarkGrid;
				if (typeof graph.view.validateBackground === 'function') {
					graph.view.validateBackground();
				}
			}
		}
	}

	function applyPatches() {
		if (typeof EditorUi === 'undefined' || EditorUi.prototype == null) {
			window.setTimeout(applyPatches, 0);
			return;
		}

		if (EditorUi.prototype.getSelectedLayoutContainer == null &&
			typeof EditorUi.prototype.getSelectedLayoutContainers === 'function') {
			EditorUi.prototype.getSelectedLayoutContainer = function () {
				var containers = this.getSelectedLayoutContainers();
				return containers.length > 0 ? containers[0] : null;
			};
		}

		var createToolbar = EditorUi.prototype.createToolbar;
		if (createToolbar == null || createToolbar.marknoteproPatched) return;
		var createUi = EditorUi.prototype.createUi;
		var installSettings = EditorUi.prototype.installSettings;
		applyMarkNoteProTheme();

		if (installSettings != null && !installSettings.marknoteproThemePatched) {
			function installSettingsWithMarkNoteProTheme() {
				var result = installSettings.apply(this, arguments);
				applyMarkNoteProTheme(this.editor != null ? this.editor.graph : null);
				return result;
			}

			installSettingsWithMarkNoteProTheme.marknoteproThemePatched = true;
			EditorUi.prototype.installSettings = installSettingsWithMarkNoteProTheme;
		}

		if (createUi != null && !createUi.marknoteproMenubarPatched) {
			function createUiWithoutMenubar() {
				var result = createUi.apply(this, arguments);

				// The menu instances stay alive for toolbar shortcuts, but the complete
				// native menu bar (including its filename area) is not rendered.
				if (this.menubarContainer != null) {
					this.menubarContainer.style.display = 'none';
				}

				return result;
			}

			createUiWithoutMenubar.marknoteproMenubarPatched = true;
			EditorUi.prototype.createUi = createUiWithoutMenubar;
		}

		function createToolbarWithDefaultEdgeIcons(container) {
			var toolbar = createToolbar.call(this, container);
			var graph = this.editor != null ? this.editor.graph : null;

			if (graph == null) return toolbar;
			applyMarkNoteProTheme(graph);

			if (this.actions != null && this.actions.get('marknoteproExportPng') == null) {
				var ui = this;
				var emitExport = function(format, filename, data, mime) {
					var parent = ui.embedMessageSource || window.opener || window.parent;
					var message = ui.createLoadMessage('export');
					message.format = format;
					message.filename = filename;
					message.data = data;
					message.mime = mime;
					message.xml = ui.getFileData(true);
					parent.postMessage(JSON.stringify(message), '*');
				};
				var exportImage = function(format, transparent) {
					ui.exportImage(1, transparent, true, false, false, 0, true, false, format);
				};
				var baseName = function() { return ui.getBaseFilename(true); };

				this.actions.addAction('marknoteproExportPng', function() { exportImage('png', true); });
				this.actions.addAction('marknoteproExportJpeg', function() { exportImage('jpeg', false); });
				this.actions.addAction('marknoteproExportWebp', function() { exportImage('webp', false); });
				this.actions.addAction('marknoteproExportGif', function() { ui.showAnimatedGifExportDialog(); });
				this.actions.addAction('marknoteproExportSvg', function() {
					emitExport('svg', baseName() + '.svg', Graph.xmlDeclaration + '\n' + Graph.svgDoctype + '\n' +
						mxUtils.getXml(graph.getSvg(null, 1, 0)), 'image/svg+xml');
				});
				this.actions.addAction('marknoteproExportPdf', function() {
					emitExport('pdf', baseName() + '.pdf', mxUtils.getXml(graph.getSvg('#ffffff', 1, 0)), 'image/svg+xml');
				});
				this.actions.addAction('marknoteproExportHtml', function() {
					emitExport('html', baseName() + '.html', ui.getHtml2(ui.getFileData(true), graph, baseName()), 'text/html');
				});
				this.actions.addAction('marknoteproExportXml', function() {
					emitExport('xml', baseName() + '.xml', Graph.xmlDeclaration + '\n' + ui.getFileData(true), 'text/xml');
				});
				this.actions.addAction('marknoteproExportDrawio', function() {
					emitExport('drawio', baseName() + '.drawio', ui.getFileData(true), 'application/vnd.jgraph.mxfile');
				});
				this.actions.addAction('marknoteproPrint', function() {
					var parent = ui.embedMessageSource || window.opener || window.parent;
					parent.postMessage(JSON.stringify({event: 'print', data: mxUtils.getXml(graph.getSvg('#ffffff', 1, 0))}), '*');
				});
				this.actions.addAction('marknoteproPreview', function() {
					var parent = ui.embedMessageSource || window.opener || window.parent;
					parent.postMessage(JSON.stringify({event: 'preview', data: mxUtils.getXml(graph.getSvg('#ffffff', 1, 0))}), '*');
				});
				this.actions.addAction('marknoteproPresentation', function() {
					// The stock presentation action opens a separate Draw.io page and
					// expects its opener to expose an EditorUi instance. That contract
					// does not exist inside MarkNotePro's BrowserView host.
					var parent = ui.embedMessageSource || window.opener || window.parent;
					parent.postMessage(JSON.stringify({event: 'presentation', data: mxUtils.getXml(graph.getSvg('#ffffff', 1, 0))}), '*');
				});
			}

			// Keep the stock side-panel button and add a separate entry for Draw.io's
			// complete View menu. Draw.io remains responsible for enabled states and
			// localization inside that menu.
			if (toolbar.container != null && toolbar.marknoteproViewMenu == null &&
				this.menus != null && this.menus.get('view') != null) {
				var oldViewMenu = toolbar.container.firstElementChild;
				var oldViewSeparator = oldViewMenu != null ? oldViewMenu.nextElementSibling : null;
				var viewIcon = 'data:image/svg+xml;base64,' +
					'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIgMTJzMy41LTcgMTAtNyAxMCA3IDEwIDctMy41IDctMTAgNy0xMC03LTEwLTdaIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIvPjwvc3ZnPg==';
				var viewMenu = toolbar.addMenu(this.menus.get('view'), null, viewIcon);

				viewMenu.className += ' marknotepro-view-menu';
				viewMenu.setAttribute('data-marknotepro-menu', 'view');
				viewMenu.setAttribute('title', mxResources.get('view'));
				toolbar.container.insertBefore(viewMenu, oldViewSeparator);
				toolbar.marknoteproViewMenu = viewMenu;

				this.dependsOnLanguage(mxUtils.bind(this, function () {
					viewMenu.setAttribute('title', mxResources.get('view'));
				}));
			}

			if (toolbar.container != null && toolbar.marknoteproEditMenu == null &&
				toolbar.marknoteproViewMenu != null && this.menus != null &&
				this.menus.get('edit') != null) {
				var editIcon = 'data:image/svg+xml;base64,' +
					'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDIwaDkiLz48cGF0aCBkPSJNMTYuNSAzLjVhMi4xMjEgMi4xMjEgMCAwIDEgMyAzTDcgMTlsLTQgMSAxLTRaIi8+PC9zdmc+';
				var editMenu = toolbar.addMenu(this.menus.get('edit'), null, editIcon);

				editMenu.className += ' marknotepro-edit-menu';
				editMenu.setAttribute('data-marknotepro-menu', 'edit');
				editMenu.setAttribute('title', mxResources.get('edit'));
				toolbar.container.insertBefore(editMenu, toolbar.marknoteproViewMenu);
				toolbar.marknoteproEditMenu = editMenu;

				this.dependsOnLanguage(mxUtils.bind(this, function () {
					editMenu.setAttribute('title', mxResources.get('edit'));
				}));
			}

			if (toolbar.container != null && toolbar.marknoteproArrangeMenu == null &&
				toolbar.marknoteproViewMenu != null && this.menus != null &&
				this.menus.get('arrange') != null) {
				var arrangeIcon = 'data:image/svg+xml;base64,' +
					'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjYiIGhlaWdodD0iNiIvPjxyZWN0IHg9IjE1IiB5PSIzIiB3aWR0aD0iNiIgaGVpZ2h0PSI2Ii8+PHJlY3QgeD0iMyIgeT0iMTUiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiLz48cmVjdCB4PSIxNSIgeT0iMTUiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiLz48L3N2Zz4=';
				var arrangeMenu = toolbar.addMenu(this.menus.get('arrange'), null, arrangeIcon);
				var followingElement = toolbar.marknoteproViewMenu.nextElementSibling;

				arrangeMenu.className += ' marknotepro-arrange-menu';
				arrangeMenu.setAttribute('data-marknotepro-menu', 'arrange');
				arrangeMenu.setAttribute('title', mxResources.get('arrange'));
				toolbar.container.insertBefore(arrangeMenu, followingElement);
				toolbar.marknoteproArrangeMenu = arrangeMenu;

				this.dependsOnLanguage(mxUtils.bind(this, function () {
					arrangeMenu.setAttribute('title', mxResources.get('arrange'));
				}));
			}

			if (toolbar.container != null && toolbar.marknoteproPageSetup == null &&
				toolbar.marknoteproArrangeMenu != null && this.actions != null &&
				this.actions.get('pageSetup') != null) {
				var pageSetupIcon = 'data:image/svg+xml;base64,' +
					'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iNCIgeT0iMyIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE4IiByeD0iMiIvPjxwYXRoIGQ9Ik04IDNoMXYySDh6Ii8+PHBhdGggZD0iTTggOGg4TTggMTJoOE04IDE2aDgiLz48L3N2Zz4=';
				var pageSetup = toolbar.addItem(pageSetupIcon, 'pageSetup');
				var followingElement = toolbar.marknoteproArrangeMenu.nextElementSibling;

				pageSetup.className += ' marknotepro-page-setup';
				pageSetup.setAttribute('data-marknotepro-menu', 'pageSetup');
				toolbar.container.insertBefore(pageSetup, followingElement);
				toolbar.marknoteproPageSetup = pageSetup;
			}

			if (toolbar.container != null && toolbar.marknoteproPresentation == null &&
				this.actions != null && this.actions.get('marknoteproPresentation') != null) {
				var presentationIcon = 'data:image/svg+xml;base64,' +
					'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iNCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjEyIiByeD0iMiIvPjxwYXRoIGQ9Ik04IDIwaDgiLz48cGF0aCBkPSJNMTIgMTZ2NCIvPjxwYXRoIGQ9Im0xMCA3LTQgMy00LTN6Ii8+PC9zdmc+';
				var presentation = toolbar.addItem(presentationIcon, 'marknoteproPresentation');
				presentation.className += ' marknotepro-presentation';
				presentation.setAttribute('title', mxResources.get('presentationMode'));
				var presentationBefore = toolbar.marknoteproPageSetup.nextElementSibling;
				toolbar.container.insertBefore(presentation, presentationBefore);
				toolbar.marknoteproPresentation = presentation;
			}

			if (toolbar.edgeStyleMenu != null) {
				toolbar.edgeStyleMenu.style.backgroundImage = 'url(' +
					this.getImageForEdgeStyle(graph.currentEdgeStyle) + ')';
			}

			if (toolbar.edgeShapeMenu != null) {
				toolbar.edgeShapeMenu.style.backgroundImage = 'url(' +
					this.getImageForEdgeShape(graph.currentEdgeStyle) + ')';
			}

			return toolbar;
		}

		createToolbarWithDefaultEdgeIcons.marknoteproPatched = true;
		EditorUi.prototype.createToolbar = createToolbarWithDefaultEdgeIcons;
	}

	applyPatches();
})();
