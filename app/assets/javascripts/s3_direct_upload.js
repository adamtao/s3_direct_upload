//= require jquery-fileupload/basic
//= require jquery-fileupload/vendor/tmpl
(function() {
  var $;

  $ = jQuery;

  $.fn.S3Uploader = function(options) {
    var $uploadForm, build_content_object, build_relativePath, cleaned_filename, current_files, forms_for_submit, has_relativePath, setUploadForm, settings;
    if (this.length > 1) {
      this.each(function() {
        return $(this).S3Uploader(options);
      });
      return this;
    }
    $uploadForm = this;
    settings = {
      path: '',
      additional_data: null,
      before_add: null,
      remove_completed_progress_bar: true,
      remove_failed_progress_bar: false,
      progress_bar_target: null,
      click_submit_target: null,
      allow_multiple_files: true
    };
    $.extend(settings, options);
    current_files = [];
    forms_for_submit = [];
    if (settings.click_submit_target) {
      settings.click_submit_target.click(function() {
        var form, i, len;
        for (i = 0, len = forms_for_submit.length; i < len; i++) {
          form = forms_for_submit[i];
          form.submit();
        }
        return false;
      });
    }
    setUploadForm = function() {
      return $uploadForm.fileupload({
        add: function(e, data) {
          var file;
          file = data.files[0];
          file.unique_id = Math.random().toString(36).substr(2, 16);
          if (!(settings.before_add && !settings.before_add(file))) {
            current_files.push(data);
            if ($('#template-upload').length > 0) {
              data.context = $($.trim(tmpl("template-upload", file)));
              $(data.context).appendTo(settings.progress_bar_target || $uploadForm);
            } else if (!settings.allow_multiple_files) {
              data.context = settings.progress_bar_target;
            }
            if (settings.click_submit_target) {
              if (settings.allow_multiple_files) {
                return forms_for_submit.push(data);
              } else {
                return forms_for_submit = [data];
              }
            } else {
              return data.submit();
            }
          }
        },
        start: function(e) {
          return $uploadForm.trigger("s3_uploads_start", [e]);
        },
        progress: function(e, data) {
          var progress;
          if (data.context) {
            progress = parseInt(data.loaded / data.total * 100, 10);
            return data.context.find('.bar').css('width', progress + '%');
          }
        },
        done: function(e, data) {
          var callback_url, content;
          content = build_content_object($uploadForm, data.files[0], data.result);
          callback_url = $uploadForm.data('callback-url');
          if (callback_url) {
            content[$uploadForm.data('callback-param')] = content.url;
            $.ajax({
              type: $uploadForm.data('callback-method'),
              url: callback_url,
              data: content,
              beforeSend: function(xhr, settings) {
                var event;
                event = $.Event('ajax:beforeSend');
                $uploadForm.trigger(event, [xhr, settings]);
                return event.result;
              },
              complete: function(xhr, status) {
                var event;
                event = $.Event('ajax:complete');
                $uploadForm.trigger(event, [xhr, status]);
                return event.result;
              },
              success: function(data, status, xhr) {
                var event;
                event = $.Event('ajax:success');
                $uploadForm.trigger(event, [data, status, xhr]);
                return event.result;
              },
              error: function(xhr, status, error) {
                var event;
                event = $.Event('ajax:error');
                $uploadForm.trigger(event, [xhr, status, error]);
                return event.result;
              }
            });
          }
          if (data.context && settings.remove_completed_progress_bar) {
            data.context.remove();
          }
          $uploadForm.trigger("s3_upload_complete", [content]);
          current_files.splice($.inArray(data, current_files), 1);
          if (!current_files.length) {
            return $uploadForm.trigger("s3_uploads_complete", [content]);
          }
        },
        fail: function(e, data) {
          var content;
          content = build_content_object($uploadForm, data.files[0], data.result);
          content.error_thrown = data.errorThrown;
          if (data.context && settings.remove_failed_progress_bar) {
            data.context.remove();
          }
          return $uploadForm.trigger("s3_upload_failed", [content]);
        },
        formData: function(form) {
          var data, fileType, key, key_field;
          data = form.serializeArray();
          fileType = "";
          if ("type" in this.files[0]) {
            fileType = this.files[0].type;
          }
          data.push({
            name: "content-type",
            value: fileType
          });
          key = $uploadForm.data("key").replace('{timestamp}', new Date().getTime()).replace('{unique_id}', this.files[0].unique_id).replace('{cleaned_filename}', cleaned_filename(this.files[0].name)).replace('{extension}', this.files[0].name.split('.').pop());
          key_field = $.grep(data, function(n) {
            if (n.name === "key") {
              return n;
            }
          });
          if (key_field.length > 0) {
            key_field[0].value = settings.path + key;
          }
          if (!('FormData' in window)) {
            $uploadForm.find("input[name='key']").val(settings.path + key);
          }
          return data;
        }
      });
    };
    build_content_object = function($uploadForm, file, result) {
      var content, domain, key;
      content = {};
      if (result) {
        content.url = $(result).find("Location").text();
        content.filepath = $('<a />').attr('href', content.url)[0].pathname;
      } else {
        domain = $uploadForm.attr('action');
        key = $uploadForm.find('input[name=key]').val();
        content.filepath = key.replace('/{filename}', '').replace('/{cleaned_filename}', '');
        content.url = domain + key.replace('/{filename}', encodeURIComponent(file.name));
        content.url = content.url.replace('/{cleaned_filename}', cleaned_filename(file.name));
      }
      content.filename = file.name;
      if ('size' in file) {
        content.filesize = file.size;
      }
      if ('lastModifiedDate' in file) {
        content.lastModifiedDate = file.lastModifiedDate;
      }
      if ('type' in file) {
        content.filetype = file.type;
      }
      if ('unique_id' in file) {
        content.unique_id = file.unique_id;
      }
      if (has_relativePath(file)) {
        content.relativePath = build_relativePath(file);
      }
      if (settings.additional_data) {
        content = $.extend(content, settings.additional_data);
      }
      return content;
    };
    cleaned_filename = function(filename) {
      return filename.replace(/\s/g, '_').replace(/[^\w.-]/gi, '');
    };
    has_relativePath = function(file) {
      return file.relativePath || file.webkitRelativePath;
    };
    build_relativePath = function(file) {
      return file.relativePath || (file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(0, -1).join("/") + "/" : void 0);
    };
    this.initialize = function() {
      $uploadForm.data("key", $uploadForm.find("input[name='key']").val());
      setUploadForm();
      return this;
    };
    this.path = function(new_path) {
      return settings.path = new_path;
    };
    this.additional_data = function(new_data) {
      return settings.additional_data = new_data;
    };
    return this.initialize();
  };

}).call(this);
