{{{ if false }}}
    <button class="btn btn-success btn-sm text-nowrap disabled" 
        id="followup-resolved">
        Resolved! well done.
    </button>

{{{ else }}}
    {{{ if canResolveFollowup }}}
        <button class="btn btn-warning btn-sm text-nowrap" 
                id="instructor-followup" 
                data-action="resolve-followup">
                📝 Follow Up Requested-- resolve??
        </button>
    {{{ end }}}

    {{{ if isStudent }}}
        {{{ if isFollowUpRequested }}}
            <button class="btn btn-secondary btn-sm text-nowrap disabled" 
                id="student-followup-pending" 
                data-status="pending">
                📝 Requested Follow Up
            </button>
        {{{ else }}}
            {{{ if canRequestFollowup }}}
                <button class="btn btn-primary btn-sm text-nowrap" 
                    id="student-followup-request" 
                    data-action="request-followup"
                    data-tid="{{tid}}">                  
                    📝 Request Follow Up
                </button>
            {{{ end }}}
        {{{ end }}}
    {{{ end }}}
{{{ end }}}
