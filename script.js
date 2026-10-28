// Global state to hold comments and current user info
let commentData = {
    currentUser: {},
    comments: []
};

// DOM Elements
const commentsListEl = document.getElementById('comments-list');
const commentFormEl = document.getElementById('comment-form');
const commentInputEl = document.getElementById('comment-input');
const currentUserAvatarEl = document.getElementById('current-user-avatar');

// ==========================================
// Utility Functions
// ==========================================

// Automatically insert a zero-width space after any slash so compound 
// words (like library/framework) wrap cleanly across browsers
function makeSlashesWrappable(text) {
    if (!text) return '';
    return text.replace(/\//g, '/\u200B');
}

// 1. Fetch data from data.json on page load
async function initComments() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Failed to load comment data');

        const data = await response.json();

        commentData.currentUser = data.currentUser;
        commentData.comments = data.comments;

        // Set current user avatar in the bottom posting form
        if (currentUserAvatarEl && commentData.currentUser.image) {
            currentUserAvatarEl.src = commentData.currentUser.image.png;
            currentUserAvatarEl.alt = `${commentData.currentUser.username}'s avatar`;
        }

        // Render comments to the DOM
        renderComments();
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

// 2. Render all comments to the page
function renderComments() {
    commentsListEl.innerHTML = ''; // Clear existing list

    commentData.comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsListEl.appendChild(commentElement);
    });
}

// 3. Helper function to build a single comment card (handles both comments and replies)
function createCommentElement(comment) {
    const li = document.createElement('li');
    li.classList.add('comments__item');

    // Check if this comment belongs to the logged-in user
    const isCurrentUser = comment.user.username === commentData.currentUser.username;

    li.innerHTML = `
    <article class="comment">
        <!-- Score Counter -->
        <div class="comment__score">
        <button type="button" class="comment__score-btn comment__score-btn--plus" aria-label="Upvote">
            <img src="images/icon-plus.svg" alt="" />
        </button>
        <span class="comment__score-number">${comment.score}</span>
        <button type="button" class="comment__score-btn comment__score-btn--minus" aria-label="Downvote">
            <img src="images/icon-minus.svg" alt="" />
        </button>
        </div>

    <!-- Comment Content -->
        <div class="comment__content">
        <header class="comment__header">
            <div class="comment__user">
            <img src="${comment.user.image.png}" alt="${comment.user.username}" />
            <div class="comment__user-details">
            <span class="comment__username">${comment.user.username}</span>
            ${isCurrentUser ? '<span class="comment__badge comment__badge--you">you</span>' : ''}
            </div>
            <span class="comment__date">${comment.createdAt}</span>
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
            ${comment.replyingTo ? `<span class="comment__replying-to">@${comment.replyingTo}</span> ` : ''}
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