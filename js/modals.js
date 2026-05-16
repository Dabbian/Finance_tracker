// Close any open modal when the user clicks the dimmed backdrop.
// Each modal has its own close function with cleanup beyond just
// hiding the element, so we dispatch by id; falls back to removing
// .active for any unmapped modal.
(function setupModalBackdropClose() {
    const closers = {
        editModal: closeEditModal,
        subscriptionModal: closeSubscriptionModal,
        editCategoryModal: closeEditCategoryModal,
        expenseDetailsModal: closeExpenseDetailsModal,
        importModal: closeImportModal,
        importDuplicatesModal: closeImportDuplicatesModal,
        quickAddModal: closeQuickAdd,
        goalModal: closeGoalModal,
        goalContribModal: closeGoalContribModal,
        snapshotModal: closeSnapshotModal,
        cutGoalDetailModal: closeCutGoalDetail,
        accountModal: closeAccountModal,
    };
    function closeTopMostModal() {
        // If multiple modals are .active, close the one rendered last
        // (top-most in stacking order — the one the user just opened).
        const active = Array.from(document.querySelectorAll('.modal.active'));
        if (active.length === 0) return false;
        const top = active[active.length - 1];
        const fn = closers[top.id];
        if (typeof fn === 'function') fn();
        else top.classList.remove('active');
        return true;
    }
    document.addEventListener('click', function (e) {
        const el = e.target;
        if (!(el instanceof HTMLElement) || !el.classList.contains('modal')) return;
        const fn = closers[el.id];
        if (typeof fn === 'function') fn();
        else el.classList.remove('active');
    });
    // Esc closes the top-most open modal. Don't intercept if the user is
    // typing in a contenteditable or hasn't actually opened a modal.
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (closeTopMostModal()) e.preventDefault();
    });
})();
