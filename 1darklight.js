document.addEventListener("DOMContentLoaded", function() {
    var modeSwitch = document.getElementById('modeSwitch');

    modeSwitch.addEventListener('change', function(e) {
        // If the checkbox is checked, dark mode is enabled, otherwise it's disabled.
        document.documentElement.classList.toggle('dark', e.target.checked);
    });
});
