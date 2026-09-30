/*
 * Copyright 2010 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
window.web3d = function() {
  var $wnd = window;
  var $doc = document;

  /****************************************************************************
   * Internal Helper Functions
   ***************************************************************************/

  function isHostedMode() {
    var query = $wnd.location.search;
    return ((query.indexOf('gwt.codesvr.web3d=') != -1) ||
            (query.indexOf('gwt.codesvr=') != -1));
  }

  // Helper function to send statistics to the __gwtStatsEvent function if it
  // exists.
  function sendStats(evtGroupString, typeString) {
    if ($wnd.__gwtStatsEvent) {
      $wnd.__gwtStatsEvent({
        moduleName: 'web3d',
        sessionId: $wnd.__gwtStatsSessionId,
        subSystem: 'startup',
        evtGroup: evtGroupString,
        millis:(new Date()).getTime(),
        type: typeString,
      });
    }
  }


  /****************************************************************************
   * Exposed Functions and Variables
   ***************************************************************************/
  // These are set by various parts of the bootstrapping code, but they always
  // need to exist, so give them all default values here.

  // Exposed for the convenience of the devmode.js and md5.js files
  window.web3d.__sendStats = sendStats;

  // Exposed for the call made to gwtOnLoad. Some are not figured out yet, so
  // assign them later, once the values are known.
  window.web3d.__moduleName = 'web3d';
  window.web3d.__errFn = null;
  window.web3d.__moduleBase = 'DUMMY';
  window.web3d.__softPermutationId = 0;

  // Exposed for devmode.js
  window.web3d.__computePropValue = null;
  // Exposed for super dev mode
  window.web3d.__getPropMap = null;

  // Exposed for runAsync
  window.web3d.__installRunAsyncCode = function() {};
  window.web3d.__gwtStartLoadingFragment = function() { return null; };

  // Exposed for property provider code
  window.web3d.__gwt_isKnownPropertyValue = function() { return false; };
  window.web3d.__gwt_getMetaProperty = function() { return null; };

  // Exposed for permutations code
  var __propertyErrorFunction = null;


  // Set up our entry in the page-wide registry of active modules.
  // It must be set up before calling computeScriptBase() and
  // getCompiledCodeFilename().
  var activeModules =
      ($wnd.__gwt_activeModules = ($wnd.__gwt_activeModules || {}));
  activeModules["web3d"] = {moduleName: "web3d"};

  window.web3d.__moduleStartupDone = function(permProps) {
    // Make embedded properties available to Super Dev Mode.
    // (They override any properties already exported.)
    var oldBindings = activeModules["web3d"].bindings;
    activeModules["web3d"].bindings = function() {
      var props = oldBindings ? oldBindings() : {};
      var embeddedProps = permProps[window.web3d.__softPermutationId];
      for (var i = 0; i < embeddedProps.length; i++) {
        var pair = embeddedProps[i];
        props[pair[0]] = pair[1];
      }
      return props;
    };
  };

  /****************************************************************************
   * Internal Helper functions that have been broken out into their own .js
   * files for readability and for easy sharing between linkers.  The linker
   * code will inject these functions in these placeholders.
   ***************************************************************************/
  // Provides getInstallLocationDoc() function.
  // GWT code can be installed anywhere, but an iFrame is the best place if you
// want both variable isolation and runAsync support. Variable isolation is
// useful for avoiding conflicts with JavaScript libraries and critical if
// you want more than one GWT module on your page. The runAsync implementation
// will need to install additional chunks of code into the same iFrame later.
//
// By default, CrossSiteIFrameLinker will use this script to create the iFrame.
// It may be replaced by overriding CrossSiteIframeLinker.getJsInstallLocation()
// to return the name of a different resource file. The replacement script may
// optionally set this variable inside the iframe:
//
// $wnd - the location where the bootstrap module is defined. It should also
//        be the location where the __gwtStatsEvent function is defined.
//        If not set, the module will set $wnd to window.parent.

var frameDoc;

function getInstallLocationDoc() {
  setupInstallLocation();
  return frameDoc;
}

// This function is left for compatibility
// and may be used by custom linkers
function getInstallLocation() {
  return getInstallLocationDoc().body;
}

function setupInstallLocation() {
  if (frameDoc) { return; }
  // Create the script frame, making sure it's invisible, but not
  // "display:none", which keeps some browsers from running code in it.
  var scriptFrame = $doc.createElement('iframe');
  scriptFrame.id = 'web3d';
  scriptFrame.style.cssText = 'position:absolute; width:0; height:0; border:none; left: -1000px;'
    + ' top: -1000px;';
  scriptFrame.tabIndex = -1;
  $doc.body.appendChild(scriptFrame);

  frameDoc = scriptFrame.contentWindow.document;

  // The following code is needed for proper operation in Firefox, Safari, and
  // Internet Explorer.
  //
  // In Firefox, this prevents the frame from re-loading asynchronously and
  // throwing away the current document.
  //
  // In IE, it ensures that the <body> element is immediately available.
  if (navigator.userAgent.indexOf("Chrome") == -1) {
    frameDoc.open();
    var doctype = (document.compatMode == 'CSS1Compat') ? '<!doctype html>' : '';
    frameDoc.write(doctype + '<html><head></head><body></body></html>');
    frameDoc.close();
  }
}


  // Installs the script directly, by simply appending a script tag with the
  // src set to the correct location to the install location.
  function installScript(filename) {
    // Provides the setupWaitForBodyLoad()function
    // Setup code which waits for the body to be loaded and then calls the
// callback function
function setupWaitForBodyLoad(callback) {
  // Provides the isBodyLoaded() function
  function isBodyLoaded() {
  if (typeof $doc.readyState == "undefined") {
    // FF 3.5 and below does not have readyState, but it does allow us to
    // append to the body before it has finished loading, so we return whether
    // the body element exists. Note that for very few apps, this may cause
    // problems because they do something in onModuleLoad that assumes the body
    // is loaded.  For those apps, we provide an alternative implementation
    // in isBodyLoadedFf35Fix.js
    return (typeof $doc.body != "undefined" && $doc.body != null);
  }
  return (/loaded|complete/.test($doc.readyState));
}

  
  var bodyDone = isBodyLoaded();

  if (bodyDone) {
    callback();
    return;
  }

  // If the page is not already loaded, setup some listeners and timers to
  // detect when it is done.
  function checkBodyDone() {
    if (!bodyDone) {
      if (!isBodyLoaded()) {
        return;
      }

      bodyDone = true;
      callback();

      if ($doc.removeEventListener) {
        $doc.removeEventListener("readystatechange", checkBodyDone, false);
      }
      if (onBodyDoneTimerId) {
        clearInterval(onBodyDoneTimerId);
      }
    }
  }

  // For everyone that supports readystatechange.
  if ($doc.addEventListener) {
    $doc.addEventListener("readystatechange", checkBodyDone, false);
  }

  // Fallback. If onBodyDone() gets fired twice, it's not a big deal.
  var onBodyDoneTimerId = setInterval(function() {
    checkBodyDone();
  }, 10);
}


    function installCode(code) {
      var doc = getInstallLocationDoc();
      var docbody = doc.body;
      var script = doc.createElement('script');
      script.language='javascript';
      script.crossOrigin='';
      script.src = code;
      if (window.web3d.__errFn) {
        script.onerror = function() {
          window.web3d.__errFn('web3d', new Error("Failed to load " + code));
        }
      }
      docbody.appendChild(script);
    }

    // Just pass along the filename so that a script tag can be installed in the
    // iframe to download it.  Since we will be adding the iframe to the body,
    // we still need to wait for the body to load before going forward.
    setupWaitForBodyLoad(function() {
      installCode(filename);
    });
  }


  // Sets the *.__installRunAsyncCode and
  // *.__startLoadingFragment functions
  window.web3d.__startLoadingFragment = function(fragmentFile) {
    return computeUrlForResource(fragmentFile);
  };

  window.web3d.__installRunAsyncCode = function(code) {
    var doc = getInstallLocationDoc();
    var docbody = doc.body;
    var script = doc.createElement('script');
    script.text = code;
    docbody.appendChild(script);

    // Unless we're in pretty mode, remove the tags to shrink the DOM a little.
    // It should have installed its code immediately after being added.
    docbody.removeChild(script);
  }

  // Provides the computeScriptBase() function
  function computeScriptBase() {
   function getDirectoryOfFile(path) {
      // Truncate starting at the first '?' or '#', whichever comes first.
      var hashIndex = path.lastIndexOf('#');
      if (hashIndex == -1) {
        hashIndex = path.length;
      }
      var queryIndex = path.indexOf('?');
      if (queryIndex == -1) {
        queryIndex = path.length;
      }
      var slashIndex = path.lastIndexOf('/', Math.min(queryIndex, hashIndex));
      return (slashIndex >= 0) ? path.substring(0, slashIndex + 1) : '';
    }
    return getDirectoryOfFile(import.meta.url);
  }

  // Provides the computeUrlForResource() function
  function computeUrlForResource(resource) {
    /* return an absolute path unmodified */
    if (resource.match(/^\//)) {
      return resource;
    }
    /* return a fully qualified URL unmodified */
    if (resource.match(/^[a-zA-Z]+:\/\//)) {
      return resource;
    }
    return window.web3d.__moduleBase + resource;
  }

  // Provides the getCompiledCodeFilename() function
  function getCompiledCodeFilename() {
    // Default to 0, as the strongName for permutation 0 does not include a ":0" suffix
    // for backwards compatibility purposes (@see PermutationsUtil::addPermutationsJs).
    var softPermutationId = 0;
    var strongName;

    try {
      // __PERMUTATIONS_BEGIN__
      // Permutation logic is injected here. this code populates the
      // answers variable.
      strongName = 'E41C5A2D87671AEF4C95E0A0C221F634';// __PERMUTATIONS_END__
      var idx = strongName.indexOf(':');
      if (idx != -1) {
        softPermutationId = parseInt(strongName.substring(idx + 1), 10);
        strongName = strongName.substring(0, idx);
      }
    } catch (e) {
      // intentionally silent on property failure
    }
    window.web3d.__softPermutationId = softPermutationId;
    return computeUrlForResource(strongName + '.cache.js');
  }

  /****************************************************************************
   * Bootstrap startup code
   ***************************************************************************/

  // Must be set before getCompiledFilename() is called
  window.web3d.__moduleBase = computeScriptBase();
  activeModules["web3d"].moduleBase = window.web3d.__moduleBase;

  // Must be done right before the "bootstrap" "end" stat is sent
  var filename = getCompiledCodeFilename();

  installScript(filename);

  return true; // success
}

window.web3d.submodules = {};
window.web3d.onReady = function(submodule, userRender) {
  function beforeRender(options, onload) {
     return new Promise(resolve => {
           var previewImagePath = null;
    var previewLoadingPath = null;
    var previewPlayPath = null;

    var setPreviewImage = function(previewFilePath, loadingFilePath, playFilePath) {
                previewImagePath = previewFilePath;
                previewLoadingPath = loadingFilePath;
                previewPlayPath = playFilePath;
    };

    var createScreenShotDiv = function(oriWidth, oriHeight, borderColor, showPlayButton) {
        var previewContainer = document.createElement("div");
        previewContainer.className = "ggb_preview";
        previewContainer.style.position = "absolute";
        previewContainer.style.zIndex = "90";
        previewContainer.style.width = oriWidth-2+'px'; // Remove 2 pixel for the border
        previewContainer.style.height = oriHeight-2+'px'; // Remove 2 pixel for the border
        previewContainer.style.top = "0px";
        previewContainer.style.left = "0px";
        previewContainer.style.overflow = "hidden";
        previewContainer.style.backgroundColor = "white";
        var bc = 'lightgrey';
        if (borderColor !== undefined) {
            if (borderColor === "none") {
                bc = "transparent";
            } else {
                bc = borderColor;
            }
        }
        previewContainer.style.border = "1px solid " + bc;

        var preview = document.createElement("img");
        preview.style.position = "relative";
        preview.style.zIndex = "1000";
        preview.style.top = "-1px"; // Move up/left to hide the border on the image
        preview.style.left = "-1px";
        if (previewImagePath !== null) {
            preview.setAttribute("src", previewImagePath);
        }
        preview.style.opacity = 0.7;

        if (previewLoadingPath !== null) {

            var previewOverlay;

            var pWidth, pHeight;
            if (!showPlayButton) {
                previewOverlay = document.createElement("img");
                previewOverlay.style.position = "absolute";
                previewOverlay.style.zIndex = "1001";
                previewOverlay.style.opacity = 1.0;

                preview.style.opacity = 0.3;

                pWidth = 360;
                if (pWidth > (oriWidth/4*3)) {
                    pWidth = oriWidth/4*3;
                }
                pHeight = pWidth/5.8;
                previewOverlay.setAttribute("src", previewLoadingPath);

                previewOverlay.setAttribute("width", pWidth);
                previewOverlay.setAttribute("height", pHeight);
                var pX = (oriWidth - pWidth) / 2;
                var pY = (oriHeight - pHeight) / 2;
                previewOverlay.style.left = pX + "px";
                previewOverlay.style.top = pY + "px";

                previewContainer.appendChild(previewOverlay);
            }
        }

        previewContainer.appendChild(preview);
        return previewContainer;
    };

    var fetchParametersFromApi = function() {
        var onSuccess = function(text) {
            var jsonData= JSON.parse(text);
            // handle either worksheet or single element format
            var isGeoGebra = function(element) {return element.type == 'G' || element.type == 'E'};
            var item = jsonData.elements ? jsonData.elements.filter(isGeoGebra)[0] : jsonData;
            if (!item || !item.url) {
                onError();
                return;
            }

            options.filename = item.url;
            updateAppletSettings(item.settings || {});
            // user setting of preview URL has precedence
            var imageDir = 'https://www.geogebra.org/images/';
            setPreviewImage(previewImagePath || item.previewUrl,
            imageDir + 'GeoGebra_loading.png', imageDir + 'applet_play.png');
            buildPreview();
            resolve(options);
        };
        var onError = function() {
            options.onError && options.onError();
            log('Error: Fetching material (id ' + options.material_id + ') failed.', parameters);
        };
    
        sendCorsRequest(
            'https://api.geogebra.org/v1.0/materials/'  + options.material_id + '?scope=basic',
            onSuccess,
            onError
        );
    };

    function buildPreview() {
        var oriWidth=options.width;
        var oriHeight=options.height;
        var previewContainer = createScreenShotDiv(oriWidth, oriHeight, options.borderColor, false);
        // This div is needed to have an element with position relative as origin for the absolute positioned image
        var previewPositioner = document.createElement("div");
        previewPositioner.className = "applet_scaler";
        previewPositioner.style.position = "relative";
        previewPositioner.style.display = 'block';
        previewPositioner.style.width = oriWidth+'px';
        previewPositioner.style.height = oriHeight+'px';
        previewPositioner.appendChild(previewContainer);
        var parentElement = options.element.parentElement;
        previewPositioner.appendChild(options.element);
        parentElement.appendChild(previewPositioner);
        options.removePreview = function() {
            var preview = document.querySelector(".ggb_preview");
            if (preview) {
                preview.parentNode.removeChild(preview);
            }
        }
        GGBAppletUtils.responsiveResize(parentElement, options);
    }

    function updateAppletSettings(settings) {
        var optionNames = ['width', 'height', 'showToolBar', 'showMenuBar',
            'showAlgebraInput', 'allowStyleBar', 'showResetIcon', 'enableLabelDrags',
            'enableShiftDragZoom', 'enableRightClick', 'appName'];
        // different defaults in API and web3d
        ['enableLabelDrags', 'enableShiftDragZoom', 'enableRightClick'].forEach(function(name) {
            settings[name] = !!settings[name];
        });
        optionNames.forEach(function(name) {
             if (options[name] === undefined && settings[name] !== undefined) {
                options[name] = settings[name];
             }
        });
        if (options.showToolBarHelp === undefined) {
            options.showToolBarHelp = options.showToolBar;
        }
    }

    // Create the XHR object.
    function sendCorsRequest(url, onSuccess, onError) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        // Response handlers.
        xhr.onload = function() {
            onSuccess(xhr.responseText);
        }
        xhr.onerror = onError;
        xhr.send();
    }

    if (options.material_id) {
        fetchParametersFromApi();
    } else {
        resolve(options);
    }

    var GGBAppletUtils = (function() {
        "use strict";

        function scaleElement(el, scale) {
            if (scale != 1) {
                el.style.transformOrigin = "0% 0% 0px";
                el.style.webkitTransformOrigin = "0% 0% 0px";
                el.style.transform = "scale(" + scale + "," + scale + ")";
                el.style.webkitTransform = "scale(" + scale + "," + scale + ")";
                el.style.maxWidth = "initial";
                // Remove the max width from the image and the div
                if (el.querySelector(".ggb_preview") !== null) {
                    el.querySelector(".ggb_preview").style.maxWidth = "initial";
                }
                if (el.querySelectorAll('.ggb_preview img')[0] !== undefined) {
                  el.querySelectorAll('.ggb_preview img')[0].style.maxWidth = "initial";
                }
                if (el.querySelectorAll('.ggb_preview img')[1] !== undefined) {
                  el.querySelectorAll('.ggb_preview img')[1].style.maxWidth = "initial"
                }
            } else {
                el.style.transform = "none";
                el.style.webkitTransform = "none";
            }
        }

        function getWidthHeight(appletElem, appletWidth, allowUpscale, autoHeight, noBorder, scaleContainerClass) {
            // Find the container class
            var container = null;
            if (scaleContainerClass != undefined && scaleContainerClass != '') {
                var parent = appletElem.parentNode;
                while(parent != null) {
                    if ((' ' + parent.className + ' ').indexOf(' ' + scaleContainerClass + ' ') > -1) {
                        container = parent;
                        break;
                    } else {
                        parent = parent.parentNode;
                    }
                }
            }

            var myWidth = 0, myHeight = 0, windowWidth = 0, border = 0, borderRight = 0, borderLeft = 0, borderTop = 0;

            if (container) {
                myWidth = container.offsetWidth;
                myHeight = Math.max(autoHeight ? container.offsetWidth : 0, container.offsetHeight);
            } else {
                if (window.innerWidth && document.documentElement.clientWidth) {
                    myWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
                    myHeight = Math.min(window.innerHeight, document.documentElement.clientHeight);
                    // Using mywith instead of innerWidth because after rotating a mobile device the innerWidth is sometimes wrong (e.g. on Galaxy Note III)
                    // windowWidth = window.innerWidth
                    windowWidth = myWidth;
                } else {
                    //Non-IE
                    myWidth = window.innerWidth;
                    myHeight = window.innerHeight;
                    windowWidth = window.innerWidth;
                }

                if (appletElem) {
                    var rect = appletElem.getBoundingClientRect();
                    if (rect.left > 0) {
                        if (rect.left <= myWidth && (noBorder === undefined || !noBorder)) {
                            if (document.dir === 'rtl') {
                                borderRight = myWidth - rect.width - rect.left;
                                borderLeft = (windowWidth <= 480 ? 10 : 30);
                            } else {
                                borderLeft = rect.left;
                                borderRight = (windowWidth <= 480 ? 10 : 30);
                            }
                            border = borderLeft + borderRight;
                        }
                    }
                }
            }

            if (appletElem) {
                if ((allowUpscale === undefined || !allowUpscale) && appletWidth > 0 && appletWidth + border < myWidth) {
                    myWidth = appletWidth;
                } else {
                    myWidth -= border;
                }
            }

            return {width: myWidth, height: myHeight};
        }

        function calcScale(parameters, appletElem, allowUpscale, showPlayButton, scaleContainerClass){
            if (parameters.isScreenshoGenerator) {
                return 1;
            }
            var ignoreHeight = (showPlayButton !== undefined && showPlayButton);
            var noScaleMargin = parameters.noScaleMargin != undefined && parameters.noScaleMargin;
            var valBoolean = function(value) {
                return (value && value !== "false");
            };
            var autoHeight = valBoolean(parameters.autoHeight);
            var windowSize = getWidthHeight(appletElem, parameters.width, allowUpscale, autoHeight, noScaleMargin, scaleContainerClass);
            var windowWidth = parseInt(windowSize.width);

            var appletWidth = parameters.width;
            var appletHeight = parameters.height;
            if (appletWidth === undefined) {
                var article = appletElem.querySelector('.appletParameters');
                if (article) {
                    appletWidth = article.offsetWidth;
                    appletHeight = article.offsetHeight;
                }
            }

            var xscale = windowWidth / appletWidth;
            var yscale = (ignoreHeight ? 1 : windowSize.height / appletHeight);
            if (allowUpscale !== undefined && !allowUpscale) {
                xscale = Math.min(1, xscale);
                yscale = Math.min(1, yscale);
            }

            return Math.min(xscale, yscale);
        }

        function getScale(parameters, appletElem, showPlayButton) {
            var scale = 1,
                autoScale,
                allowUpscale = false;

            if (parameters.hasOwnProperty('allowUpscale')) {
                allowUpscale = parameters.allowUpscale;
            }

            if (parameters.hasOwnProperty('scale')) {
                scale = parseFloat(parameters.scale);
                if (isNaN(scale) || scale === null || scale === 0) {
                    scale = 1;
                }
                if (scale > 1) {
                    allowUpscale = true;
                }
            }

            if (!(parameters.hasOwnProperty('disableAutoScale') && parameters.disableAutoScale)) {
                autoScale = calcScale(parameters, appletElem, allowUpscale, showPlayButton, parameters.scaleContainerClass);
            } else {
                return scale;
            }

            if (allowUpscale && (!parameters.hasOwnProperty('scale') || scale === 1)) {
                return autoScale;
            } else {
                return Math.min(scale, autoScale);
            }
        }

        function responsiveResize(appletElem, parameters) {
            var article = appletElem.querySelector(".ggb_preview");

            if (article) {

                if(article.parentElement && (/fullscreen/).test(article.parentElement.className)){
                    return; //fullscreen button inside applet pressed
                }

                var scale = getScale(parameters, appletElem);

                var scaleElem = null;
                for (var i = 0; i < appletElem.childNodes.length; i++) {
                    if (appletElem.childNodes[i].className !== undefined && appletElem.childNodes[i].className.match(/^applet_scaler/)) {
                        scaleElem = appletElem.childNodes[i];
                        break;
                    }
                }

                if (scaleElem !== null && scaleElem.querySelector(".noscale") !== null) {
                    return;
                }

                var appName = (parameters.id !== undefined ? parameters.id : "ggbApplet");
                var app = window[appName];

                if ((app == null || !app.recalculateEnvironments) && scaleElem !== null && !scaleElem.className.match(/fullscreen/)) {
                    scaleElem.parentNode.style.transform = "";
                    if (!isNaN(scale) && scale !== 1) {
                        // Set the scale factor for the applet
                        scaleElem.parentNode.style.width = (parameters.width * scale) + 'px';
                        scaleElem.parentNode.style.height = (parameters.height * scale) + 'px';
                        scaleElement(scaleElem, scale);

                    } else {
                        // Remove scaling
                        scaleElement(scaleElem, 1);
                        scaleElem.parentNode.style.width = (parameters.width) + 'px';
                        scaleElem.parentNode.style.height = (parameters.height) + 'px';
                    }
                }
            }
        }

        return {
            responsiveResize: responsiveResize,
            getScale: getScale,
            scaleElement: scaleElement
        };
    })();
     });
  }

  const render = (options, onload) => {
    beforeRender(options, onload).then(opts => userRender(opts, onload))
  }

  for (let callback of window.web3d.submodules[submodule].callbacks) {
    callback(render);
  }
  window.web3d.submodules[submodule].render = render;
}

window.web3d.succeeded = window.web3d();

function Widget(options, submodule, baseTag)  {
  const self = this;
  self.loading = false;
  this.apiCallbacks = [api => self.api = api];

  function runCallbacks(api) {
    for (const callback of self.apiCallbacks) {
      callback(api);
    }
    if (options.removePreview) {
      options.removePreview();
    }
  }

  function load() {
    self.loading = true;
    if (submodule.render) {
      submodule.render(options, runCallbacks);
    } else {
      submodule.callbacks.push(render => render(options, runCallbacks));
    }
  }

  this.inject = function(element) {
    const target = document.createElement(baseTag);
    options.element = target;
    element.appendChild(target);
    load();
    return this;
  }

  this.getAPI = function() {
    return new Promise(resolve => {
      if (self.api) {
        resolve(self.api);
      } else if (self.loading) {
        self.apiCallbacks.push(resolve);
      } else {
        load(resolve);
      }
    });
  }

  if (options.tagName || options.element) {
    load();
  }
}

const createSubmoduleAPI = (submodule, baseTag) => {
  window.web3d.submodules[submodule] = {callbacks:[]};
  return {
    create: (options) => {
      return new Widget(options || {}, window.web3d.submodules[submodule], baseTag);
    }
  }
};
// add export statements
export const mathApps = createSubmoduleAPI("mathApps", "div");
