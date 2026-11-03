// ==========================================
// Supabase Initialization
// ==========================================
const SUPABASE_URL = 'https://ezvatkiaefusitpxadhq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dmF0a2lhZWZ1c2l0cHhhZGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NjQ5MDUsImV4cCI6MjEwOTE0MDkwNX0.Y6A9z_TQFSmMSNNXNhPBADRXSq61FM5KycHYkbNgDPs';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state to hold comments and current user info
let commentData = {
    currentUser: {
        username: "juliusomo",
        image: {
            png: "images/image-juliusomo.png"
        }
    },
    comments: []
};

// ==========================================
// DOM Elements
// ==========================================
const commentsListEl = document.getElementById('comments-list');
const commentFormEl = document.getElementById('comment-form');
const commentInputEl = document.getElementById('comment-input');
const currentUserAvatarEl = document.getElementById('current-user-avatar');
const deleteModalEl = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Keep track of which comment ID is targeted for deletion
let commentToDeleteId = null;

// ==========================================
// Utility Functions
// ==========================================

function makeSlashesWrappable(text) {
    if (!text) return '';
    return text.replace(/\//g, '/\u200B');
}

// Helper to transform flat Supabase rows into a nested tree structure
function nestComments(flatComments) {
    const map = {};
    const roots = [];
    
    flatComments.forEach(comment => {
        map[comment.id] = { ...comment, replies: [], userVote: 0 };
    });
    
    flatComments.forEach(comment => {
        if (comment.parent_id) {
            if (map[comment.parent_id]) {
                map[comment.parent_id].replies.push(map[comment.id]);
            }
        } else {
            roots.push(map[comment.id]);
        }
    });
    
    return roots;
}

// Helper to find a comment or reply by its ID in the nested tree
function findCommentById(comments, id) {
    for (const comment of comments) {
        if (comment.id == id) return comment;
        if (comment.replies && comment.replies.length > 0) {
            const found = findCommentById(comment.replies, id);
            if (found) return found;
        }
    }
    return null;
}

// 1. Fetch data from Supabase on page load
async function initComments() {
    try {
        console.log("Fetching comments from Supabase...");
        const { data, error } = await supabase
            .from('Interactive Comments Section')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;

        console.log("Data received from Supabase:", data);

        // Convert flat rows into nested tree structure
        commentData.comments = nestComments(data || []);

        // Set current user avatar in the bottom posting form
        if (currentUserAvatarEl && commentData.currentUser.image) {
            currentUserAvatarEl.src = commentData.currentUser.image.png;
            currentUserAvatarEl.alt = `${commentData.currentUser.username}'s avatar`;
        }

        // Render comments to the DOM
        renderComments();
    } catch (error) {
        console.error('Error loading comments from Supabase:', error);
    }
}

// 2. Render all comments to the page
function renderComments() {
    if (!commentsListEl) {
        console.error("Could not find 'comments-list' element in the DOM!");
        return;
    }

    commentsListEl.innerHTML = ''; // Clear existing list

    if (commentData.comments.length === 0) {
        console.warn("No comments found to render.");
        return;
    }

    commentData.comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsListEl.appendChild(commentElement);
    });
}

// 3. Helper function to build a single comment card (handles both comments and replies)
function createCommentElement(comment) {
    const li = document.createElement('li');
    li.classList.add('comments__item');
    li.dataset.id = comment.id;

    // Check if this comment belongs to the logged-in user
    const isCurrentUser = comment.username === commentData.currentUser.username;

    // Format the date nicely if needed, or fallback to created_at
    const formattedDate = comment.created_at ? new Date(comment.created_at).toLocaleDateString() : 'Just now';

    li.innerHTML = `
    <article class="comment">
        <!-- Score Counter -->
        <div class="comment__score">
        <button type="button" class="comment__score-btn comment__score-btn--plus" aria-label="Upvote">
            <svg width="11" height="11" xmlns="http://www.w3.org/2000/svg"><path d="M6.33 10.896c.137 0 .255-.05.354-.149.1-.1.149-.217.149-.354V7.004h3.315c.136 0 .254-.05.354-.149.099-.1.148-.217.148-.354V5.272a.483.483 0 0 0-.148-.354.483.483 0 0 0-.354-.149H6.833V1.4a.483.483 0 0 0-.149-.354.483.483 0 0 0-.354-.149H4.915a.483.483 0 0 0-.354.149c-.1.1-.149.217-.149.354v3.37H1.08a.483.483 0 0 0-.354.15c-.1.099-.149.217-.149.353v1.23c0 .136.05.254.149.353.1.1.217.149.354.149h3.333v3.39c0 .136.05.254.15.353.098.1.216.149.353.149H6.33Z" fill="currentColor"/></svg>
        </button>
        <span class="comment__score-number">${comment.score}</span>
        <button type="button" class="comment__score-btn comment__score-btn--minus" aria-label="Downvote">
            <svg width="11" height="3" xmlns="http://www.w3.org/2000/svg"><path d="M9.256 2.66c.204 0 .38-.056.53-.167.148-.11.222-.243.222-.396V.722c0-.152-.074-.284-.223-.395a.859.859 0 0 0-.53-.167H.76a.859.859 0 0 0-.53.167C.083.437.009.57.009.722v1.375c0 .153.074.285.223.396a.859.859 0 0 0 .53.167h8.495Z" fill="currentColor"/></svg>
        </button>
        </div>

    <!-- Comment Content -->
        <div class="comment__content">
        <header class="comment__header">
            <div class="comment__user">
            <img src="${comment.user_image}" alt="${comment.username}" />
            <div class="comment__user-details">
            <span class="comment__username">${comment.username}</span>
            ${isCurrentUser ? '<span class="comment__badge comment__badge--you">you</span>' : ''}
            </div>
            <span class="comment__date">${formattedDate}</span>
            </div>

        <!-- Action Buttons (Dynamic based on ownership) -->
        <div class="comment__actions">
            ${isCurrentUser
            ? `<button type="button" class="comment__action comment__action--delete">
                    <img src="images/icon-delete.svg" alt="" /> Delete
                    </button>
                    <button type="button" class="comment__action comment__action--edit">
                    <img src="images/icon-edit.svg" alt="" /> Edit
                    </button>`
            : `<button type="button" class="comment__action comment__action--reply">
                    <img src="images/icon-reply.svg" alt="" /> Reply
                    </button>`
        }
            </div>
        </header>

        <!-- Main Body Text (Wrapped with makeSlashesWrappable) -->
        <p class="comment__text">
            ${comment.replying_to ? `<span class="comment__replying-to">@${comment.replying_to}</span> ` : ''}
            ${makeSlashesWrappable(comment.content)}
        </p>
        </div>
    </article>

    <!-- Nested Replies Container -->
    <div class="comment__replies">
        <ul class="comments__list comments__list--nested">
        <!-- Child replies injected here -->
        </ul>
    </div>
    `;

    // 4. Recursively render any replies if they exist
    if (comment.replies && comment.replies.length > 0) {
        const repliesListEl = li.querySelector('.comment__replies .comments__list');
        comment.replies.forEach(reply => {
            const replyElement = createCommentElement(reply);
            repliesListEl.appendChild(replyElement);
        });
    }

    return li;
}

// Run init function when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initComments);

// ==========================================
// Form Submission Logic (Insert / POST)
// ==========================================
if (commentFormEl) {
    commentFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = commentInputEl.value.trim();
        if (!content) return;

        // Prepare the new comment payload matching your Supabase columns
        const newComment = {
            content: content,
            score: 0,
            username: commentData.currentUser.username,
            user_image: commentData.currentUser.image.png,
            replying_to: null,
            parent_id: null
        };

        try {
            const { data, error } = await supabase
                .from('Interactive Comments Section')
                .insert([newComment])
                .select();

            if (error) throw error;

            // Clear input box
            commentInputEl.value = '';

            // Refresh comments list from Supabase
            await initComments();
        } catch (error) {
            console.error('Error posting comment to Supabase:', error);
            alert('Failed to post comment. Check console for details.');
        }
    });
}

// ==========================================
// Upvote / Downvote Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', async (e) => {
        const scoreBtn = e.target.closest('.comment__score-btn');
        if (!scoreBtn) return;

        const commentItem = scoreBtn.closest('.comments__item');
        if (!commentItem) return;

        const commentId = commentItem.dataset.id;
        const isUpvote = scoreBtn.classList.contains('comment__score-btn--plus');
        const scoreNumberEl = commentItem.querySelector('.comment__score-number');

        // Find the comment object in our global commentData tree
        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        let currentScore = commentObj.score;
        let currentVote = commentObj.userVote;
        let scoreChange = 0;

        // Calculate vote toggle and score change
        if (isUpvote) {
            if (currentVote === 1) {
                scoreChange = -1;
                commentObj.userVote = 0;
            } else if (currentVote === -1) {
                scoreChange = 2;
                commentObj.userVote = 1;
            } else {
                scoreChange = 1;
                commentObj.userVote = 1;
            }
        } else {
            if (currentVote === -1) {
                scoreChange = 1;
                commentObj.userVote = 0;
            } else if (currentVote === 1) {
                scoreChange = -2;
                commentObj.userVote = -1;
            } else {
                scoreChange = -1;
                commentObj.userVote = -1;
            }
        }

        const newScore = currentScore + scoreChange;

        try {
            const { error } = await supabase
                .from('Interactive Comments Section')
                .update({ score: newScore })
                .eq('id', commentId);

            if (error) throw error;

            // Update local object and UI
            commentObj.score = newScore;
            scoreNumberEl.textContent = newScore;
        } catch (error) {
            console.error('Error updating score in Supabase:', error);
            alert('Failed to update score. Check console for details.');
        }
    });
}

// ==========================================
// Reply Form Toggle Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.comment__action--reply');
        if (!replyBtn) return;

        const commentItem = replyBtn.closest('.comments__item');
        if (!commentItem) return;

        // Check if a reply form already exists inside this comment item to avoid duplicates
        const existingReplyForm = commentItem.querySelector('.reply-form-container');
        if (existingReplyForm) {
            existingReplyForm.remove(); // Toggle it closed if clicked again
            return;
        }

        // Get the username of the person being replied to
        const usernameEl = commentItem.querySelector('.comment__username');
        const replyingToUser = usernameEl ? usernameEl.textContent : '';

        // Create the reply form container element
        const replyFormDiv = document.createElement('div');
        replyFormDiv.classList.add('reply-form-container');
        
        replyFormDiv.innerHTML = `
            <form class="reply-form" id="reply-form">
                <img src="${commentData.currentUser.image.png}" alt="${commentData.currentUser.username}" class="reply-form__avatar" />
                <textarea class="reply-form__input" placeholder="Write a reply..." required>@${replyingToUser} </textarea>
                <button type="submit" class="reply-form__btn">Reply</button>
            </form>
        `;

        // Append the form right below the comment article/content
        commentItem.appendChild(replyFormDiv);

        // Focus the textarea and place the cursor at the very end of "@username "
        const textarea = replyFormDiv.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
}

// ==========================================
// Click-Outside Dismissal for Reply Form
// ==========================================
document.addEventListener('click', (event) => {
    const activeReplyForm = document.querySelector('.reply-form-container');
    
    if (activeReplyForm && !activeReplyForm.contains(event.target) && !event.target.closest('.comment__action--reply')) {
        activeReplyForm.remove();
    }
});

// ==========================================
// Delete Modal & Actions Logic
// ==========================================

// 1. Listen for clicks inside the comments list (Delegation for Delete buttons)
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.comment__action--delete');
        if (!deleteBtn) return;

        // Find the parent comment item that holds the data-id attribute
        const commentItem = deleteBtn.closest('.comments__item');
        if (commentItem) {
            commentToDeleteId = commentItem.dataset.id;
            // Show the modal by removing the 'invisible' class
            deleteModalEl.classList.remove('invisible');
        }
    });
}

// 2. Cancel Button: Hide modal and clear stored ID
if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
        deleteModalEl.classList.add('invisible');
        commentToDeleteId = null;
    });
}

// 3. Confirm Delete Button: Execute Supabase Delete query
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!commentToDeleteId) return;

        try {
            const { error } = await supabase
                .from('Interactive Comments Section')
                .delete()
                .eq('id', commentToDeleteId);

            if (error) throw error;

            // Hide modal and refresh comments list
            deleteModalEl.classList.add('invisible');
            commentToDeleteId = null;
            await initComments();
        } catch (error) {
            console.error('Error deleting comment from Supabase:', error);
            alert('Failed to delete comment. Check console for details.');
        }
    });
}

// ==========================================
// Edit Comment Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.comment__action--edit');
        if (!editBtn) return;

        const commentItem = editBtn.closest('.comments__item');
        if (!commentItem) return;

        const commentContentEl = commentItem.querySelector('.comment__content');
        const commentTextP = commentItem.querySelector('.comment__text');

        // Prevent opening multiple edit forms on the same comment
        if (commentContentEl.querySelector('.edit-form-container')) return;

        // Find the comment object to get its raw content
        const commentId = commentItem.dataset.id;
        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        // Hide the original text paragraph while editing
        commentTextP.style.display = 'none';

        // Create the edit form container
        const editFormDiv = document.createElement('div');
        editFormDiv.classList.add('edit-form-container');
        editFormDiv.style.marginTop = '0.5rem';

        editFormDiv.innerHTML = `
            <form class="edit-form">
                <textarea class="comment__form-input edit-form__input" style="width: 100%; min-height: 5rem; resize: none;" required>${commentObj.content}</textarea>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem;">
                    <button type="button" class="comment__form-button edit-form__btn--cancel" style="background-color: var(--grey-500);">Cancel</button>
                    <button type="submit" class="comment__form-button">Update</button>
                </div>
            </form>
        `;

        // Append the edit form to the comment content area
        commentContentEl.appendChild(editFormDiv);

        // Fix initial text area height
        const textarea = editFormDiv.querySelector('textarea');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';

        // Focus the textarea and place cursor at the end of the text
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // Handle Cancel action
        const cancelBtn = editFormDiv.querySelector('.edit-form__btn--cancel');
        cancelBtn.addEventListener('click', () => {
            editFormDiv.remove();
            commentTextP.style.display = ''; // Restore original text
        });

        // Handle Submit (Update) action
        const editForm = editFormDiv.querySelector('.edit-form');
        editForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const updatedContent = textarea.value.trim();
            if (!updatedContent) return;

            try {
                const { error } = await supabase
                    .from('Interactive Comments Section')
                    .update({ content: updatedContent })
                    .eq('id', commentId);

                if (error) throw error;

                // Clean up and refresh comments list from Supabase
                editFormDiv.remove();
                commentTextP.style.display = '';
                await initComments();
            } catch (error) {
                console.error('Error updating comment in Supabase:', error);
                alert('Failed to update comment. Check console for details.');
            }
        });
    });
}