(function(window, undefined) {        
    var emptyFunc = function(){};

    function clone(obj){
        if(obj == null || typeof(obj) != 'object')
            return obj;

        var temp = obj.constructor(); // changed

        for(var key in obj)
            temp[key] = clone(obj[key]);

        return temp;
    }

    function hashToQueryString(hash) {
        var params = [];

        for (key in hash) {
            if (hash.hasOwnProperty(key)) {
                params.push(key + "=" + hash[key]);
            }
        }

        return params.join('&');
    }
    
    if (XMLHttpRequest && !XMLHttpRequest.prototype.sendAsBinary) { 
        XMLHttpRequest.prototype.sendAsBinary = function(datastr) {
            var bb = new BlobBuilder();
            var data = new ArrayBuffer(datastr.length);
            var ui8a = new Uint8Array(data, 0);
            for (var i=0; i<datastr.length; i++) {
                    ui8a[i] = (datastr.charCodeAt(i) & 0xff);
            }
            bb.append(data);
            var blob = bb.getBlob();
            this.send(blob);
        }
    }

    function Ajax(url, options) { 
        console.log("Sending request with options:", url, options);

        if (options == undefined) {
            options = {};
        }

        var xhr = function() {
            if (typeof XMLHttpRequest === 'undefined') {
                XMLHttpRequest = function() {
                    try { return new ActiveXObject("Msxml2.XMLHTTP.6.0"); }
                        catch(e) {}
                    try { return new ActiveXObject("Msxml2.XMLHTTP.3.0"); }
                        catch(e) {}
                    try { return new ActiveXObject("Msxml2.XMLHTTP"); }
                        catch(e) {}
                    try { return new ActiveXObject("Microsoft.XMLHTTP"); }
                        catch(e) {}
                    throw new Error("This browser does not support XMLHttpRequest.");
                };
            }

            return new XMLHttpRequest();
        }();            

        if (options.method !== "POST" && options.params) {
            url += "?" + hashToQueryString(options.params);
        }
        
        xhr.open(options.method || "GET", url, true);  

        xhr.onreadystatechange = function(){
            if (xhr.readyState == 4) {
                // Parse response if it contains JSON string
                var response = xhr.responseText[0] === '{' ? (function(){
                                                                 return window.JSON && window.JSON.parse ?
                                                                    window.JSON.parse(xhr.responseText) :
                                                                    (new Function("return "+xhr.responseText))()
                                                             }()) :
                                                             xhr.responseText;

                if (xhr.status == 200) {
                    (options.onSuccess || emptyFunc)(response, xhr);
                } else {
                    (options.onError || emptyFunc)(response, xhr);
                }
            }
        }
        
        // Setting Request headers
        if (!options.headers) options.headers = {};        

        if (!options.headers["Content-Type"] && options.method === "POST") {
            options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }

        for (key in options.headers) {
            if (options.headers.hasOwnProperty(key)) {
                xhr.setRequestHeader(key, options.headers[key]);
            }
        }
        
        if (options.mime_type) xhr.overrideMimeType(options.mime_type);        
        
        // Sending data
        if (options.method === "POST" && (options.params || options.binaryData)) {
            if (options.binaryData) {
                xhr.sendAsBinary(options.binaryData);
            } else {
                xhr.send(hashToQueryString(options.params));
            }
        } else {
            xhr.send(null);
        }

        return xhr;
    };


    var Minus = {
        prefix: 'http://min.us/api/'
    }        

    Minus.callMethod = function(method, options) {        
        if (options == undefined) {
            options = {}
        }

        var new_options = clone(options);

        console.log("new options:", new_options, options);

        new_options.onSuccess = function(resp, xhr){
            console.debug("Method '%s' called succesefully", method, options, resp);
            
            (options.onSuccess || emptyFunc)(resp, xhr);        
        }

        new_options.onError = function(resp, xhr){
            console.debug("Error while calling method '%s'", method, options, resp);

            (options.onError || emptyFunc)(resp, xhr);        
        }

        return new Ajax(this.prefix + method, new_options);
    }

    Minus.createGallery = function(callback) {
        this.callMethod('CreateGallery', {
            onSuccess: callback,
            onError: function(resp) {
                callback({ error: "api_error", message: "Error while calling API method 'CreateGallery'" });
            }
        });
    }

    Minus.saveGallery = function(name, editor_id, items, callback) {
        this.callMethod('SaveGallery', {
            method: "POST",
            params: {
                name: name,
                id: editor_id,
                key: "OK",
                items: items
            },            
            onSuccess: callback,
            onError: function(resp) {
                callback({ error: "api_error", message: "Error while calling API method 'saveGallery'" });
            }
        });
    }

    
    Minus.uploadItem = function(editor_id, filename, mime, binaryData, callback) {
        var params = hashToQueryString({ editor_id: editor_id, key: "OK", filename:encodeURIComponent(filename) });

        var boundary = '---------------------------';
        boundary += Math.floor(Math.random()*32768);
        boundary += Math.floor(Math.random()*32768);
        boundary += Math.floor(Math.random()*32768);

        var data = '--' + boundary + "\r\n";
        data += 'Content-Disposition: form-data; name="file"; filename="' + filename + '"' + "\r\n";
        data += 'Content-Type: ' + mime + "\r\n\r\n";
        data += binaryData;
        data += "\r\n";
        data += "\r\n" + '--' + boundary + '--'
        data += "\r\n";

        this.callMethod('UploadItem?'+params, {
            method: "POST",
            headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
            binaryData: data,            
            onSuccess: callback,
            onError: function(resp) {
                callback({ error: "api_error", message: "Error while calling API method 'UploadItem'" });
            }
        });
    }

    Minus.uploadItemFromURL = function(url, editor_id, callback) {
        if (!callback)
            callback = emptyFunc;

        var head = new Ajax(url, {
            method: "HEAD",

            onSuccess: function() {
                var size = parseInt(head.getResponseHeader('Content-Length'));
                var filename = url.substring(url.lastIndexOf("/")+1);
                var mime = head.getResponseHeader("Content-Type");

                // Maximum file size
                if (size > 10000000) {
                    console.error("File too large");

                    callback({ error: "file_size_error", message: "Maximum allowed file size is 10 mb." });
                } else {
                    var data = new Ajax(url, {
                        mime_type: 'text/plain; charset=x-user-defined',
                        onSuccess: function() {
                            Minus.uploadItem(editor_id, filename, mime, data.responseText, callback);
                        }
                    });
                }
            }, 

            onError: function() {
                callback({ error: "file_download_error", message: "Can't download file" });
            }
        });
    }

    Minus.getItems = function(reader_id, callback) {
        this.callMethod('GetItems/m'+reader_id, {
            onSuccess: callback,
            onError: function(resp) {
                callback({ error: "api_error", message: "Error while calling API method 'GetItems'" });
            }
        });
    }
       
    Minus.myGalleries = function(callback) {
        this.callMethod('MyGalleries.json', {
            onSuccess: callback,
            onError: function(resp) {                
                callback({ error: "api_error", message: "Error while calling API method 'MyGalleries'" });
            }
        });
    }


    // Make it Global
    window.Minus = Minus;
}(window));
