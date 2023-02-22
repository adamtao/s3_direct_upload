/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//= require jquery-fileupload/basic
//= require jquery-fileupload/vendor/tmpl

const $ = jQuery;

$.fn.S3Uploader = function(options) {

  // support multiple elements
  if (this.length > 1) {
    this.each(function() {
      return $(this).S3Uploader(options);
    });

    return this;
  }

  const $uploadForm = this;

  const settings = {
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

  const current_files = [];
  let forms_for_submit = [];
  if (settings.click_submit_target) {
    settings.click_submit_target.click(function() {
      for (var form of Array.from(forms_for_submit)) { form.submit(); }
      return false;
    });
  }

  const $wrapping_form = $uploadForm.closest('form');
  if ($wrapping_form.length > 0) {
    $wrapping_form.off('submit').on('submit', function() {
      $wrapping_form.find('.s3_uploader input').prop("disabled", true);
      return true;
    });
  }

  const setUploadForm = function() {
    return $uploadForm.find("input[type='file']").fileupload({

      add(e, data) {
        const file = data.files[0];
        file.unique_id = Math.random().toString(36).substr(2,16);

        if (!settings.before_add || !!settings.before_add(file)) {
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

      start(e) {
        return $uploadForm.trigger("s3_uploads_start", [e]);
      },

      progress(e, data) {
        if (data.context) {
          const progress = parseInt((data.loaded / data.total) * 100, 10);
          return data.context.find('.bar').css('width', progress + '%');
        }
      },

      done(e, data) {
        const content = build_content_object($uploadForm, data.files[0], data.result);

        const callback_url = $uploadForm.data('callback-url');
        if (callback_url) {
          content[$uploadForm.data('callback-param')] = content.url;

          $.ajax({
            type: $uploadForm.data('callback-method'),
            url: callback_url,
            data: content,
            beforeSend( xhr, settings )       {
              const event = $.Event('ajax:beforeSend');
              $uploadForm.trigger(event, [xhr, settings]);
              return event.result;
            },
            complete( xhr, status )         {
              const event = $.Event('ajax:complete');
              $uploadForm.trigger(event, [xhr, status]);
              return event.result;
            },
            success( data, status, xhr )   {
              const event = $.Event('ajax:success');
              $uploadForm.trigger(event, [data, status, xhr]);
              return event.result;
            },
            error( xhr, status, error )  {
              const event = $.Event('ajax:error');
              $uploadForm.trigger(event, [xhr, status, error]);
              return event.result;
            }
          });
        }

        if (data.context && settings.remove_completed_progress_bar) { data.context.remove(); } // remove progress bar
        $uploadForm.trigger("s3_upload_complete", [content]);

        current_files.splice($.inArray(data, current_files), 1); // remove that element from the array
        if (!current_files.length) { return $uploadForm.trigger("s3_uploads_complete", [content]); }
      },

      fail(e, data) {
        const content = build_content_object($uploadForm, data.files[0], data.result);
        content.error_thrown = data.errorThrown;

        if (data.context && settings.remove_failed_progress_bar) { data.context.remove(); } // remove progress bar
        return $uploadForm.trigger("s3_upload_failed", [content]);
      },

      formData(form) {
        const data = $uploadForm.find("input").serializeArray();
        let fileType = "";
        if ("type" in this.files[0]) {
          fileType = this.files[0].type;
        }
        data.push({
          name: "content-type",
          value: fileType
        });

        const key = $uploadForm.data("key")
          .replace('{timestamp}', new Date().getTime())
          .replace('{unique_id}', this.files[0].unique_id)
          .replace('{cleaned_filename}', cleaned_filename(this.files[0].name))
          .replace('{extension}', this.files[0].name.split('.').pop());

        // substitute upload timestamp and unique_id into key
        const key_field = $.grep(data, function(n) {
          if (n.name === "key") { return n; }
        });

        if (key_field.length > 0) {
          key_field[0].value = settings.path + key;
        }

        // IE <= 9 doesn't have XHR2 hence it can't use formData
        // replace 'key' field to submit form
        if (!('FormData' in window)) {
          $uploadForm.find("input[name='key']").val(settings.path + key);
        }
        return data;
      }
    });
  };

  var build_content_object = function($uploadForm, file, result) {
    let content = {};
    if (result) { // Use the S3 response to set the URL to avoid character encodings bugs
      content.url            = $(result).find("Location").text();
      content.filepath       = $('<a />').attr('href', content.url)[0].pathname;
    } else { // IE <= 9 retu      rn a null result object so we use the file object instead
      const domain                 = $uploadForm.find('input[type=file]').data('url');
      const key                    = $uploadForm.find('input[name=key]').val();
      content.filepath       = key.replace('/{filename}', '').replace('/{cleaned_filename}', '');
      content.url            = domain + key.replace('/{filename}', encodeURIComponent(file.name));
      content.url            = content.url.replace('/{cleaned_filename}', cleaned_filename(file.name));
    }

    content.filename         = file.name;
    if ('size' in file) { content.filesize         = file.size; }
    if ('lastModifiedDate' in file) { content.lastModifiedDate = file.lastModifiedDate; }
    if ('type' in file) { content.filetype         = file.type; }
    if ('unique_id' in file) { content.unique_id        = file.unique_id; }
    if (has_relativePath(file)) { content.relativePath     = build_relativePath(file); }
    if (settings.additional_data) { content = $.extend(content, settings.additional_data); }
    return content;
  };

  var cleaned_filename = filename => filename.replace(/\s/g, '_').replace(/[^\w.-]/gi, '');

  var has_relativePath = file => file.relativePath || file.webkitRelativePath;

  var build_relativePath = file => file.relativePath || (file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(0, +-2 + 1 || undefined).join("/") + "/" : undefined);

  //public methods
  this.initialize = function() {
    // Save key for IE9 Fix
    $uploadForm.data("key", $uploadForm.find("input[name='key']").val());

    setUploadForm();
    return this;
  };

  this.path = new_path => settings.path = new_path;

  this.additional_data = new_data => settings.additional_data = new_data;

  return this.initialize();
};
