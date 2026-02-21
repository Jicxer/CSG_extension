$(document).ready(function () {
  "use strict";
  $( "#tabs" ).tabs();
  
function highlightAll(selector) {
  const el = document.querySelector(selector);
  if (!el) return;

  el.focus();
  el.select();

  // Extra safety for some browsers
  if (el.setSelectionRange) {
    el.setSelectionRange(0, el.value.length);
  }
}


function toClipboardHtmlFromPlain(text) {
	// Input: raw plain text from the textarea
	// Output: HTML text
  const t = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Escapes unsafe HTML characters (<,>)
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Provides structure
  const html =
    "<div>" +
    t
      .split(/\n{2,}/) // Two or more newlines creates a new paragraph
      .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>") // Single new line -> line break
      .join("") +
    "</div>";

  // Returns text/plain -> fallback and text/html -> preferred
  return { t, html };
}

function getSelectedOrAllText(textarea, copyAllIfNoSelection = true) {
  const v = textarea.value || "";
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;

  if (start !== end) return { text: v.slice(start, end), start, end, hadSelection: true }; // Case 1: User selected text
  if (copyAllIfNoSelection) return { text: v, start: 0, end: v.length, hadSelection: false }; // Case 2: User did not select text
  return { text: "", start, end, hadSelection: false };
}

// COPY: Ctrl+C 
$(document).on("copy", "textarea.atmNotes, textarea.HatmNotes", function (e) {
  const evt = e.originalEvent || e;
  if (!evt.clipboardData) return; // can't control clipboard then let browser choose

  const sel = getSelectedOrAllText(this, true); // can set false if you only want selection instead of select all
  const { t, html } = toClipboardHtmlFromPlain(sel.text);

  evt.preventDefault(); // Important: Prevents text/plain from reaching clipboard
  evt.clipboardData.setData("text/plain", t);
  evt.clipboardData.setData("text/html", html);
});

// CUT: Ctrl+X
$(document).on("cut", "textarea.atmNotes, textarea.HatmNotes", function (e) {
  const evt = e.originalEvent || e;
  if (!evt.clipboardData) return;

  const sel = getSelectedOrAllText(this, true);
  const { t, html } = toClipboardHtmlFromPlain(sel.text);

  evt.preventDefault();
  evt.clipboardData.setData("text/plain", t);
  evt.clipboardData.setData("text/html", html);

  // Mimic cut by removing the selection (or everything if no selection and copyAll=true)
  if (sel.text.length > 0) {
    const v = this.value || "";
    this.value = v.slice(0, sel.start) + v.slice(sel.end);
    this.selectionStart = this.selectionEnd = sel.start;

    this.dispatchEvent(new Event("input", { bubbles: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

	
	function copyNotesAsHtml(selector) {
  // Pick the visible textarea if multiple exist (tabs/panels)
  const areas = Array.from(document.querySelectorAll(selector));
  if (!areas.length) return;

  const isVisible = (el) =>
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const ta = areas.find(isVisible) || areas[0];

  // Normalize newlines
  const t = (ta.value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // Escape HTML special chars
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Convert text to HTML preserving line breaks:
  // - blank lines become paragraph breaks
  // - single newlines become <br>
  const paragraphs = t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`);
  const html = `<div>${paragraphs.join("")}</div>`;

  // Try rich clipboard first
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        "text/plain": new Blob([t], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });

      navigator.clipboard.write([item]).catch(() => {
        // Fallback to legacy copy (plain text only)
        legacyCopyPlainText(t);
      });
      return;
    }
  } catch (e) {
    // If fails then use fall back below
  }

  // Fallback: legacy copy (plain text only)
  legacyCopyPlainText(t);

  function legacyCopyPlainText(text) {
    const tmp = document.createElement("textarea");
    tmp.value = text || "";
    tmp.setAttribute("readonly", "");
    tmp.style.position = "fixed";
    tmp.style.left = "-9999px";
    document.body.appendChild(tmp);
    tmp.focus();
    tmp.select();
    tmp.setSelectionRange(0, tmp.value.length);
    document.execCommand("copy");
    document.body.removeChild(tmp);
  }
}

  //NCR hide and reveal panels
  $(".up").attr('title', 'up and in service at login. ');
  $(".down").attr('title', 'down and out of service at login. ');
  $(".terLim").attr('title', 'Terminal is up but in limited service and may be unable to ');
  $(".terrecur").attr('title', 'after diagnostic testing, no transactions for this device have been performed to confirm the initial fault will not recur');
  $('.panel').hide();
  $('.Rpanel').hide();
  $('.cassettesPanel').hide();
  $('.binPanel').hide();
  $('.jafPanel').hide();
  $('.sdmPanel').hide();
  $('.sdm2Panel').hide();
  $('.depmiscPanel').hide();
  $('.limPanel').hide();
  $('.miscPanel').hide();
  $('.Spanel').hide();
  $('.Fpanel').hide();
  $('.Recpanel').hide();
  $('.Cardpanel').hide();
  $('.EPPpanel').hide();
  $('.Cpanel').hide();
  $('.FCpanel').hide();
  $('.Dpanel').hide();
  $('.Hpanel').hide();
  $('.depPanel').hide();
  $(".hideRec").click(function(){ $(".Recpanel").slideToggle("fast"); });
  $(".hideCard").click(function(){ $(".Cardpanel").slideToggle("fast"); });
  $(".hideEPP").click(function(){ $(".EPPpanel").slideToggle("fast"); });
  $(".hideDep").click(function(){ $(".depPanel").slideToggle("fast"); });
  $(".hideFaults").click(function(){ $(".Fpanel").slideToggle("fast"); });
  $(".hideCleared").click(function(){ $(".FCpanel").slideToggle("fast"); });
  $(".hideTests").click(function(){ $(".Spanel").slideToggle("fast"); });
  $(".hideResults").click(function(){ $(".Rpanel").slideToggle("fast"); });
  $(".ch").click(function(){ $(".panel").slideToggle("fast"); });
  $(".cas").click(function(){ $(".cassettesPanel").slideToggle("fast"); });
  $(".bin").click(function(){ $(".binPanel").slideToggle("fast"); });
  $(".jaf").click(function(){ $(".jafPanel").slideToggle("fast"); });
  $(".sdm").click(function(){ $(".sdmPanel").slideToggle("fast"); });
  $(".sdm2").click(function(){ $(".sdm2Panel").slideToggle("fast"); });
  $(".dmisc").click(function(){ $(".depmiscPanel").slideToggle("fast"); });
  $(".lim").click(function(){ $(".limPanel").slideToggle("fast"); });
  $(".misc").click(function(){ $(".miscPanel").slideToggle("fast"); });
  $(".coin").click(function(){ $(".Cpanel").slideToggle("fast"); });
  $(".Hch").click(function(){ $(".Hpanel").slideToggle("fast"); });
	
  //Hyosung hide and reveal panels
  $(".Hup").attr('title', 'up and in service at login. ');
  $(".Hdown").attr('title', 'down and out of service at login. ');
  $(".HterLim").attr('title', 'Terminal is up but in limited service and may be unable to ');
  $(".Hterrecur").attr('title', 'after diagnostic testing, no transactions for this device have been performed to confirm the initial fault will not recur');
  $('.Hpanel').hide();
  $('.HcasPanel').hide();
  $('.HTpanel').hide();
  $('.HRpanel').hide();
  $('.HlimPanel').hide();
  $(".Hfaults").click(function(){ $(".Hpanel").slideToggle("fast"); });
  $(".Hcas").click(function(){ $(".HcasPanel").slideToggle("fast"); });
  $(".Hwork").click(function(){ $(".HTpanel").slideToggle("fast"); });
  $(".Hres").click(function(){ $(".HRpanel").slideToggle("fast"); });
  $(".Hlim").click(function(){ $(".HlimPanel").slideToggle("fast"); });
  
  //**********************************************************
  //NCR 
  //What happens when you click add button for the NCR tab
  $('.addResults').click(function () {
	$('.atmNotes').val("");
	var addFaults = "";
	var addCassettes = "";
	var addWorkStart = "";
	var addWorkTests = "";
	var addResultStart = "";
	var addResultLim = "";
	var addResultWit = "";
	var addResultPickWit = "";
	var addFixed = "";
	var addNetwork = "";
	var addLastDate = ""; 

	$('input:checkbox[name=lastFaultsNA]:checked').each(function() { addLastDate += $(this).val(); });
	$('input:checkbox[name=faultsNA]:checked').each(function() { addFaults += $(this).val(); }); 
	if ($('[name="cassettes"]').val().length > 0) { addCassettes += 'Dispenser:'; }
	$('[name="cassettes"]').each(function () { addCassettes += $(this).val(); });
	if ($('[name="cassettes"]').val().length > 0) { addCassettes += ','; };
	if ($('[name="bins"]').val().length > 0) { addCassettes += 'Dispenser:'; }
	$('[name="bins"]').each(function () { addCassettes += $(this).val(); });
	if ($('[name="bins"]').val().length > 0) { addCassettes += ','; }
	$('[name="jaf"]').each(function () { addCassettes += $(this).val(); });
	if ($('[name="jaf"]').val().length > 0) { addCassettes += ','; } 
	$('[name="coin"]').each(function () { addCassettes += $(this).val(); });
	if ($('[name="coin"]').val().length > 0) { addCassettes += ','; }
	$('[name="sdm"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="sdm"]').val().length > 0) { addFaults += ','; }
	$('[name="sdm2"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="sdm2"]').val().length > 0) { addFaults += ','; }
	$('[name="dmisc"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="dmisc"]').val().length > 0) { addFaults += ','; }
	$('[name="scpm"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="scpm"]').val().length > 0) { addFaults += ','; }
	$('[name="scpm2"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="scpm2"]').val().length > 0) { addFaults += ','; }
	$('[name="bna"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="bna"]').val().length > 0) { addFaults += ','; }
	$('[name="ed"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="ed"]').val().length > 0) { addFaults += ','; }
	$('[name="misc"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="misc"]').val().length > 0) { addFaults += ','; }
	$('[name="rec"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="rec"]').val().length > 0) { addFaults += ','; }
	$('[name="card"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="card"]').val().length > 0) { addFaults += ','; }
	$('[name="epp"]').each(function () { addFaults += $(this).val(); });
	if ($('[name="epp"]').val().length > 0) { addFaults += ','; }
	$('input:checkbox[name=lastFaults]:checked').each(function() { if (addFaults !== "") { addFaults += ','; } addFaults += $(this).val(); });
	$('input:radio[name=workDone]:checked').each(function() { addWorkStart += $(this).val(); });
	$('input:checkbox[name=workDone]:checked').each(function() { addWorkStart += $(this).val(); });
	$('[name="tests"]').each(function () { addWorkTests += $(this).val(); });
	$('input:radio[name=network]:checked').each(function() { addNetwork += $(this).val(); });
	$('input:checkbox[name=result]:checked').each(function() { addResultStart += $(this).val(); });
	$('[name="pickLim"]').each(function () { addResultLim += $(this).val(); });
	$('input:radio[name=fix]:checked').each(function() { addFixed += $(this).val(); });

        //add everything to atmNotes 
		$('.atmNotes').val($('.atmNotes').val() + 'Last fault of this type: ' + $('.dateTime').val() + addLastDate + '\n\n' + 'Logged into ATM, confirmed ATM wasn\'t being used by a customer, logged in further to the maintenance software' + '\n\n' + 'Faults Present: ' + addCassettes + addFaults);

        //take out last comma at the end of faults section
		$('.atmNotes').val($('.atmNotes').val().replace(/,\s*$/, ""));

        //add everything to atmNotes
		$('.atmNotes').val($('.atmNotes').val() + '\n\n' + 'Work done: Terminal was ' + addWorkStart + 'Entered supervisor mode. Ran test(s) on the ' + addWorkTests + ', exited supervisor mode and attempted to return terminal to service' + '\n\n' + 'Result: ' + addResultStart + addResultWit + addResultPickWit + addResultLim + '\n\n' + 'ATM in service with the network: ' + addNetwork + '\n\n' + 'Fixed/Not fixed: ' + addFixed); 

        /* Copy notes to clipboard (plain text, consistent) */
		copyNotesAsHtml("textarea.atmNotes");
		highlightAll("textarea.atmNotes"); // Does nothing logic wise. Meant for UI


	});
	
	$('.clear').click(function () {
		/* Select the text field */
        $('.atmNotes').val("");
	});
	
	$('.updateClip').click(function () {
		/* Copy notes to clipboard (plain text, consistent) */
		copyNotesAsHtml("textarea.atmNotes");
		highlightAll("textarea.atmNotes"); // Does nothing logic wise. Meant for UI

	});
//What happens when you click reset button for the NCR tab
	$('.resetAtmNotes').click(function () {
		$('.atmNotes').val("");
		$('.dateTime').val("");
		$('.purgeBin').val("");
		$('[name=cassettes]').val("");
		$('.jams').val("");
		$('[name=coin]').val("");
		$('[name=bins]').val("");
		$('[name=jaf]').val("");
		$('[name=sdm]').val("");
		$('[name=sdm2]').val("");
		$('[name=dmisc]').val("");
		$('[name=scpm]').val("");
		$('[name=scpm2]').val("");
		$('[name=bna]').val("");
		$('[name=ed]').val("");
		$('[name=rec]').val("");
		$('[name=card]').val("");
		$('[name=epp]').val("");
		$('[name=misc]').val("");
		$('input:checkbox[name=lastFaults]').prop('checked', false);
		$('input:checkbox[name=lastFaultsNA]').prop('checked', false);
		$('input:checkbox[name=faultsNA]').prop('checked', false);
		$('input:checkbox[name=faults]').prop('checked', false);
		$('input:checkbox[name=workDone]').prop('checked', false);
		$('input:radio[name=workDone]').prop('checked', false);
		$('input:radio[name=network]').prop('checked', false);
		$('[name=tests]').val("");
		$('input:checkbox[name=result]').prop('checked', false);
		$('.pickLim').val("");
		$('input:radio[name=fix]').prop('checked', false);
		$('.panel').hide();
		$('.Rpanel').hide();
		$('.cassettesPanel').hide();
		$('.binPanel').hide();
		$('.jafPanel').hide();
		$('.sdmPanel').hide();
		$('.sdm2Panel').hide();
		$('.depmiscPanel').hide();
		$('.limPanel').hide();
		$('.miscPanel').hide();
		$('.RecPanel').hide();
		$('.Spanel').hide();
		$('.Fpanel').hide();
		$('.Cpanel').hide();
		$('.Dpanel').hide();
		$('.Hpanel').hide();
		$('.FCpanel').hide();
		$('.depPanel').hide();
		$('.Recpanel').hide();
        $('.Cardpanel').hide();
        $('.EPPpanel').hide();
	});
	
	//End NCR
	//********************************************************
	
	//********************************************************
	//What happens when you click add button for the Hyosung tab
	$('.HaddResults').click(function () {//waht happens when you click add button
		$('.HatmNotes').val("");
		var addFaults = "";
		var addCassettes = "";
		var addWorkStart = "";
		var addWorkTests = "";
		var addResultStart = "";
		var addResultLim = "";
		var addFixed = "";
		var addNetwork = "";
		var addLastDate = "";

		$('input:checkbox[name=Hfaults]:checked').each(function() { addFaults += $(this).val(); });
		if ($('[name="Hcassettes"]').val().length > 0) { addCassettes += 'Dispenser:'; }
		$('[name="Hcassettes"]').each(function () { addCassettes += $(this).val(); });
		if ($('[name="Hcassettes"]').val().length > 0) { addCassettes += ','; };
		$('.Hfaults').each(function () { addFaults += $(this).val(); });
		$('input:checkbox[name=HfaultsNA]:checked').each(function() { addFaults += $(this).val(); });
		$('input:checkbox[name=HfaultsNA2]:checked').each(function() { addLastDate += $(this).val(); });
		$('input:radio[name=HworkDone]:checked').each(function() { addWorkStart += $(this).val(); });
		$('input:checkbox[name=HworkDone]:checked').each(function() { addWorkStart += $(this).val(); });
		$('.Htests').each(function() { addWorkTests += $(this).val(); });
		$('input:checkbox[name=Htests]:checked').each(function() { addWorkTests += $(this).val(); });
		$('input:radio[name=Hnetwork]:checked').each(function() { addNetwork += $(this).val(); });
		$('input:checkbox[name=Hresult]:checked').each(function() { addResultStart += $(this).val(); });
		$('[name="HpickLim"]').each(function () { addResultLim += $(this).val(); });
		$('input:radio[name=Hfix]:checked').each(function() { addFixed += $(this).val();});
		
		//add everything to atmNotes 
		$('.HatmNotes').val($('.HatmNotes').val() + 'Last fault of this type: ' + $('.HdateTime').val() + addLastDate + '\n\n' + 'Logged into ATM, confirmed ATM wasn\'t being used by a customer, logged in further to the maintenance software' + '\n\n' + 'Faults present: ' + addFaults + addCassettes);
		
		//take out last comma at the end of faults section
		$('.HatmNotes').val($('.HatmNotes').val().replace(/,\s*$/, ""));
		
		//add everything to atmNotes 
		$('.HatmNotes').val($('.HatmNotes').val() + '\n\n' + 'Work done: Terminal was ' + addWorkStart + 'Entered supervisor mode, ' + addWorkTests + 'exited supervisor mode and returned terminal to service' + '\n\n' + 'Result: ' + addResultStart + addResultLim + '\n\n' + 'ATM in service with the network: ' + addNetwork + '\n\n' + 'Fixed/Not fixed: ' + addFixed);
		
		/* Copy notes to clipboard (plain text, consistent) */
		copyNotesAsHtml("textarea.HatmNotes");
		highlightAll("textarea.HatmNotes");

	});
	
	$('.Hclear').click(function () {
		/* Select the text field */
        $('.HatmNotes').val("");
	});
	
	$('.HupdateClip').click(function () {
		/* Copy notes to clipboard (plain text, consistent) */
		copyNotesAsHtml("textarea.HatmNotes"); // Does nothing logic wise. Meant for UI
		highlightAll("textarea.HatmNotes"); // Does nothing logic wise. Meant for UI

	});
	
	//What happens when you click reset button for the Hyosung tab
	$('.HresetAtmNotes').click(function () {
		$('.HatmNotes').val("");
		$('.HdateTime').val("");
		$('.Hfaults').val("");
		$('.Hcassettes').val("");
		$('.Htests').val("");
		$('.HpickLim').val("");
		$('input:checkbox[name=HfaultsNA]').prop('checked', false);
		$('input:checkbox[name=HfaultsNA2]').prop('checked', false);
		$('input:checkbox[name=Hfaults]').prop('checked', false);
		$('input:checkbox[name=HworkDone]').prop('checked', false);
		$('input:radio[name=HworkDone]').prop('checked', false);
		$('input:radio[name=Hbranch]').prop('checked', false);
		$('input:radio[name=Hnetwork]').prop('checked', false);
		$('input:checkbox[name=Htests]').prop('checked', false);
		$('input:checkbox[name=Hresult]').prop('checked', false);
		$('input:radio[name=Hfix]').prop('checked', false);
		$('.Hpanel').hide();
		$('.HcasPanel').hide();
		$('.HRpanel').hide();
		$('.HTpanel').hide();
		$('.HlimPanel').hide();
	});
});