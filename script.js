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

// Session flag to prevent auto-restoring comment 4 after manual deletion
let comment4ManuallyDeleted = false;

// ==========================================
// Utility Functions
// ==========================================
/**
 * Inserts a zero-width space after every slash to allow text wrapping 
 * without breaking layout boundaries or altering visual strings.
 */
function makeSlashesWrappable(text) {
    if (!text) return '';
    return text.replace(/\//g, '/\u200B');
}

// Converts potentially dangerous characters into safe HTML entities (XSS Prevention)
const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

const reUnescapedHtml = /[&<>"']/g;
const reHasUnescapedHtml = RegExp(reUnescapedHtml.source);

function escape(string) {
    return (string && reHasUnescapedHtml.test(string))
        ? string.replace(reUnescapedHtml, (chr) => htmlEscapes[chr])
        : (string || '');
}

/**
 * Transforms a flat array of Supabase rows into a hierarchical tree structure:
 * - Maps each comment/reply by ID.
 * - Resolves parent relationships.
 * - Sorts roots and child replies in ascending chronological order.
 */
function nestComments(flatComments) {
    const map = {};
    const roots = [];

    // 1. Map each comment by its ID
    flatComments.forEach(comment => {
        map[comment.id] = { ...comment, replies: [] };
    });

    // Helper to find the top-level root safely without loops
    function findRoot(item) {
        let current = item;
        let depth = 0;
        while (depth < 5) {
            depth++;
            if (!current.parent_id && !current.replying_to) {
                return current;
            }
            if (current.parent_id && map[current.parent_id]) {
                current = map[current.parent_id];
            } else if (current.replying_to) {
                const parent = Object.values(map).find(c => c.username === current.replying_to && c.id !== current.id);
                if (parent) {
                    current = parent;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        return current;
    }

    // 2. Assign replies to their ultimate root parent
    flatComments.forEach(comment => {
        const item = map[comment.id];
        if (!comment.parent_id && !comment.replying_to) {
            roots.push(item);
        } else {
            const root = findRoot(item);
            if (root && root.id !== item.id) {
                root.replies.push(item);
            } else {
                roots.push(item);
            }
        }
    });

    // 3. Sort root comments (Oldest at the top: ascending ID order)
    roots.sort((a, b) => a.id - b.id);

    // 4. Sort replies oldest to newest for each root container
    roots.forEach(root => {
        if (root.replies && root.replies.length > 0) {
            root.replies.sort((a, b) => a.id - b.id);
        }
    });

    return roots;
}

// Helper function to format new ISO timestamps into relative time or pass through static data.json date strings
function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';

    // If it's already a relative text string from data.json (e.g. "1 month ago"), return it as-is
    if (isNaN(Date.parse(dateString))) {
        return dateString;
    }

    // Otherwise, calculate relative time from an ISO timestamp
    const now = new Date();
    const past = new Date(dateString);
    const elapsedSeconds = Math.floor((now - past) / 1000);

    const minutes = Math.floor(elapsedSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    if (months > 0) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    if (weeks > 0) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    return 'Just now';
}

// Helper to find a comment or reply by its ID
function findCommentById(comments, id) {
    for (const comment of comments) {
        if (String(comment.id) === String(id)) return comment; 
        
        if (comment.replies && comment.replies.length > 0) {
            const found = findCommentById(comment.replies, id);
            if (found) return found;
        }
    }
    return null;
}

// ==========================================
// Initialize, Fetch & Self-Heal Comments
// ==========================================
async function initComments() {
    // 1. Set the avatar immediately
    if (currentUserAvatarEl && commentData.currentUser.image) {
        currentUserAvatarEl.src = commentData.currentUser.image.png;
        currentUserAvatarEl.alt = `${commentData.currentUser.username}'s avatar`;
    }

    // 2. INSTANT LOAD: Check if we have cached comments in localStorage
    const cachedComments = localStorage.getItem('cached_comments');
    if (cachedComments) {
        try {
            const parsedComments = JSON.parse(cachedComments);
            commentData.comments = parsedComments;
            renderComments(); // Renders instantly with zero wait time!
        } catch (e) {
            console.error("Error parsing cache:", e);
        }
    }

    // 3. BACKGROUND FETCH: Get fresh data from Supabase
    try {
        let { data: commentsData, error: commentsError } = await supabase
            .from('Interactive Comments Section')
            .select('*')
            .order('id', { ascending: false }); // Oldest IDs at the top

        if (commentsError) throw commentsError;

        // --- AUTOMATIC RESTORATION FOR DEMO COMMENT (ID 4) ---
    // Ensures there's always a comment to test deleting/editing
        const targetSeedId = "4";
        const exists = commentsData ? commentsData.some(c => String(c.id) === String(targetSeedId)) : false;

        // Only restore if it's missing and it wasn't just manually deleted in this session
        if (!exists && !comment4ManuallyDeleted) {
            console.log('Attempting to restore demo comment 4...');
            const payload = {
                id: 4,
                content: "I couldn't agree more with this. Everything moves so fast and it always seems like everyone knows the newest library/framework. But the fundamentals are what stay constant.",
                score: 2,
                username: "juliusomo",
                user_image: "images/image-juliusomo.png",
                replying_to: "ramsesmiron",
                parent_id: 2,
                created_at: new Date().toISOString()
            };

            const { error: restoreError } = await supabase
                .from('Interactive Comments Section')
                .upsert([payload]);

            if (restoreError) {
                console.error('FAILED TO RESTORE COMMENT 4:', restoreError.message, restoreError.details, restoreError.hint);
            } else {
                console.log('Successfully restored comment 4!');
                const { data: refreshedData } = await supabase
                    .from('Interactive Comments Section')
                    .select('*')
                    .order('id', { ascending: false });
                commentsData = refreshedData;
            }
        }
        // --------------------------------------------------------------

        const { data: votesData, error: votesError } = await supabase
            .from('votes')
            .select('*')
            .eq('username', commentData.currentUser.username);

        if (votesError) throw votesError;

        const userVotesMap = {};
        if (votesData) {
            votesData.forEach(vote => {
                userVotesMap[vote.comment_id] = vote.vote_type;
            });
        }

        const flatCommentsWithVotes = (commentsData || []).map(comment => ({
            ...comment,
            userVote: userVotesMap[comment.id] || 0
        }));

        const nestedTree = nestComments(flatCommentsWithVotes);

        // Update local state and cache it for next time
        commentData.comments = nestedTree;
        localStorage.setItem('cached_comments', JSON.stringify(nestedTree));

        // Re-render with the freshest data from the server
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

    // Format the date if needed, or fallback to created_at
    const formattedDate = getRelativeTime(comment.createdAt || comment.created_at);

    // Apply active class if the user previously voted on this comment
    const upvoteActiveClass = comment.userVote === 1 ? 'active' : '';
    const downvoteActiveClass = comment.userVote === -1 ? 'active' : '';

    li.innerHTML = `
    <article class="comment">
        <!-- Score Counter -->
        <div class="comment__score">
        <button type="button" class="comment__score-btn comment__score-btn--plus ${upvoteActiveClass}" aria-label="Upvote">
            <svg width="11" height="11" xmlns="http://www.w3.org/2000/svg"><path d="M6.33 10.896c.137 0 .255-.05.354-.149.1-.1.149-.217.149-.354V7.004h3.315c.136 0 .254-.05.354-.149.099-.1.148-.217.148-.354V5.272a.483.483 0 0 0-.148-.354.483.483 0 0 0-.354-.149H6.833V1.4a.483.483 0 0 0-.149-.354.483.483 0 0 0-.354-.149H4.915a.483.483 0 0 0-.354.149c-.1.1-.149.217-.149.354v3.37H1.08a.483.483 0 0 0-.354.15c-.1.099-.149.217-.149.353v1.23c0 .136.05.254.149.353.1.1.217.149.354.149h3.333v3.39c0 .136.05.254.15.353.098.1.216.149.353.149H6.33Z" fill="currentColor"/></svg>
        </button>
        <span class="comment__score-number">${comment.score}</span>
        <button type="button" class="comment__score-btn comment__score-btn--minus ${downvoteActiveClass}" aria-label="Downvote">
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

        const newComment = {
            content: content,
            score: 0,
            username: commentData.currentUser.username,
            user_image: commentData.currentUser.image.png,
            replying_to: null,
            parent_id: null,
            created_at: new Date().toISOString()
        };

        try {
            const { error } = await supabase
                .from('Interactive Comments Section')
                .insert([newComment]);

            if (error) throw error;

            commentInputEl.value = '';
            await initComments();
        } catch (error) {
            console.error('Error posting comment to Supabase:', error);
            alert('Failed to post comment. Check console for details.');
        }
    });
}

// ==========================================
// Upvote / Downvote Logic (Persistent via votes table)
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', async (e) => {
        const scoreBtn = e.target.closest('.comment__score-btn');
        if (!scoreBtn) return;

        const commentItem = scoreBtn.closest('.comments__item');
        if (!commentItem) return;

        const commentId = commentItem.dataset.id;
        const numericCommentId = parseInt(commentId, 10); // Parse to integer for int8 columns

        const isUpvote = scoreBtn.classList.contains('comment__score-btn--plus');
        const scoreNumberEl = commentItem.querySelector('.comment__score-number');

        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        let currentScore = commentObj.score;
        let currentVote = commentObj.userVote;
        let scoreChange = 0;
        let newVoteType = 0;

        if (isUpvote) {
            if (currentVote === 1) {
                scoreChange = -1;
                newVoteType = 0;
            } else if (currentVote === -1) {
                scoreChange = 2;
                newVoteType = 1;
            } else {
                scoreChange = 1;
                newVoteType = 1;
            }
        } else {
            if (currentVote === -1) {
                scoreChange = 1;
                newVoteType = 0;
            } else if (currentVote === 1) {
                scoreChange = -2;
                newVoteType = -1;
            } else {
                scoreChange = -1;
                newVoteType = -1;
            }
        }

        const newScore = currentScore + scoreChange;

        try {
            // 1. Update the votes table using numericCommentId
            if (newVoteType === 0) {
                const { error: deleteError } = await supabase
                    .from('votes')
                    .delete()
                    .match({ comment_id: numericCommentId, username: commentData.currentUser.username });
                if (deleteError) throw deleteError;
            } else {
                const { error: upsertError } = await supabase
                    .from('votes')
                    .upsert({
                        comment_id: numericCommentId,
                        username: commentData.currentUser.username,
                        vote_type: newVoteType
                    }, { onConflict: 'comment_id, username' });
                if (upsertError) throw upsertError;
            }

            // 2. Update the comment's total score in the main table using numericCommentId
            const { error: scoreError } = await supabase
                .from('Interactive Comments Section')
                .update({ score: newScore })
                .eq('id', numericCommentId);

            if (scoreError) throw scoreError;

            // 3. Clear cache so local storage doesn't overwrite the new score on reload
            localStorage.removeItem('cached_comments');

            // Update local object and UI instantly
            commentObj.score = newScore;
            commentObj.userVote = newVoteType;
            scoreNumberEl.textContent = newScore;
        } catch (error) {
            console.error('Error updating vote in Supabase:', error);
            alert('Failed to update vote. Check console for details.');
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

        // Check if there is any open reply form on the page
        const existingReplyForm = document.querySelector('.reply-form-container');
        const isCurrentCommentForm = existingReplyForm && commentItem.contains(existingReplyForm);

        // 1. Remove the old reply form if one exists anywhere on the page
        if (existingReplyForm) {
            existingReplyForm.remove();
        }

        // 2. If the user clicks Reply on the same comment that was open, we just want to close it (toggle)
        if (isCurrentCommentForm) {
            return;
        }

        // 3. Otherwise, create and open the new reply form
        const usernameEl = commentItem.querySelector('.comment__username');
        const replyingToUser = usernameEl ? usernameEl.textContent : '';

        const replyFormDiv = document.createElement('div');
        replyFormDiv.classList.add('reply-form-container');

        replyFormDiv.innerHTML = `
            <form class="reply-form" id="reply-form">
                <img src="${commentData.currentUser.image.png}" alt="${commentData.currentUser.username}" class="reply-form__avatar" />
                <textarea class="reply-form__input" placeholder="Write a reply..." required>@${replyingToUser} </textarea>
                <button type="submit" class="reply-form__btn">Reply</button>
            </form>
        `;

        const commentArticle = commentItem.querySelector('.comment');
        commentArticle.after(replyFormDiv);

        const textarea = replyFormDiv.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // Reply Form Submission Listener
        const replyForm = replyFormDiv.querySelector('.reply-form');
        replyForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();

            // --- STRIP THE PRE-FILLED @USERNAME HERE ---
            const rawContent = textarea.value.trim();
            const content = rawContent.startsWith('@')
                ? rawContent.replace(/^@\S+\s*/, '')
                : rawContent;

            if (!content) return;

            const parentId = parseInt(commentItem.dataset.id, 10);

            const newReply = {
                content: content,
                score: 0,
                username: commentData.currentUser.username,
                user_image: commentData.currentUser.image.png,
                replying_to: replyingToUser,
                parent_id: parentId,
                created_at: new Date().toISOString()
            };

            try {
                const { error } = await supabase
                    .from('Interactive Comments Section')
                    .insert([newReply]);

                if (error) throw error;

                replyFormDiv.remove();
                await initComments();
            } catch (error) {
                console.error('Error posting reply to Supabase:', error);
                alert('Failed to post reply. Check console for details.');
            }
        });
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
// Delete Modal & Actions Logic (Native <dialog>)
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.comment__action--delete');
        if (!deleteBtn) return;

        const commentItem = deleteBtn.closest('.comments__item');
        if (commentItem) {
            commentToDeleteId = commentItem.dataset.id;
            if (deleteModalEl && typeof deleteModalEl.showModal === 'function') {
                deleteModalEl.showModal();
            }
        }
    });
}

if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
        if (deleteModalEl && typeof deleteModalEl.close === 'function') {
            deleteModalEl.close();
        }
        commentToDeleteId = null;
    });
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!commentToDeleteId) return;

        // Check if comment 4 is being deleted
        if (String(commentToDeleteId) === "4") {
            comment4ManuallyDeleted = true;
        }

        try {
            const { error } = await supabase
                .from('Interactive Comments Section')
                .delete()
                .eq('id', commentToDeleteId);

            if (error) throw error;

            if (deleteModalEl && typeof deleteModalEl.close === 'function') {
                deleteModalEl.close();
            }
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

        if (commentContentEl.querySelector('.edit-form-container')) return;

        const commentId = commentItem.dataset.id;
        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        commentTextP.style.display = 'none';

        const editFormDiv = document.createElement('div');
        editFormDiv.classList.add('edit-form-container');
        editFormDiv.style.marginBlockStart = '0.5rem';

        editFormDiv.innerHTML = `
            <form class="edit-form">
                <textarea class="comment__form-input edit-form__input" style="width: 100%; min-height: 5rem; resize: none;" required>${commentObj.content}</textarea>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-block-start: 0.75rem;">
                    <button type="button" class="comment__form-button edit-form__btn--cancel" style="background-color: var(--grey-500);">Cancel</button>
                    <button type="submit" class="comment__form-button">Update</button>
                </div>
            </form>
        `;

        commentContentEl.appendChild(editFormDiv);

        const textarea = editFormDiv.querySelector('textarea');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const cancelBtn = editFormDiv.querySelector('.edit-form__btn--cancel');
        cancelBtn.addEventListener('click', () => {
            editFormDiv.remove();
            commentTextP.style.display = '';
        });

        const editForm = editFormDiv.querySelector('.edit-form');
        editForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const updatedContent = textarea.value.trim();
            if (!updatedContent) return;

            const numericCommentId = parseInt(commentId, 10);

            try {
                // 1. Update Supabase in the background
                const { error } = await supabase
                    .from('Interactive Comments Section')
                    .update({ content: updatedContent })
                    .eq('id', numericCommentId);

                if (error) throw error;

                // 2. Update the local JavaScript object immediately
                commentObj.content = updatedContent;

                // 3. Update the paragraph on the screen instantly
                const replyingToHtml = commentObj.replying_to ? `<span class="comment__replying-to">@${commentObj.replying_to}</span> ` : '';
                commentTextP.innerHTML = replyingToHtml + makeSlashesWrappable(updatedContent);

                // 4. Update the localStorage cache so it matches
                localStorage.setItem('cached_comments', JSON.stringify(commentData.comments));

                // 5. Clean up the form and bring the text back
                editFormDiv.remove();
                commentTextP.style.display = '';
            } catch (error) {
                console.error('Error updating comment in Supabase:', error);
                alert('Failed to update comment. Check console for details.');
            }
        });
    });
}