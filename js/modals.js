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
        quickAddModal: closeQuickAdd,
        goalModal: closeGoalModal,
        goalContribModal: closeGoalContribModal,
        snapshotModal: closeSnapshotModal,
        cutGoalDetailModal: closeCutGoalDetail,
        accountModal: closeAccountModal,
    };
    document.addEventListener('click', function (e) {
        const el = e.target;
        if (!(el instanceof HTMLElement) || !el.classList.contains('modal')) return;
        const fn = closers[el.id];
        if (typeof fn === 'function') fn();
        else el.classList.remove('active');
    });
})();
