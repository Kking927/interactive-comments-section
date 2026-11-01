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
        map[comment.id] = { ...comment, replies: [] };
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