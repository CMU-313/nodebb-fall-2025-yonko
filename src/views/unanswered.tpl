{{{ if widgets.header.length }}}
    <div class="category">
        <div id="category-no-topics" class="alert alert-info {{{ if topics.length }}}hidden{{{ end }}}">Load More Unanswered Questions</div>

        <button id="load-more-btn" class="btn btn-primary hide">Load More</button>
        
        {{{ if config.usePagination }}}
        {{{ end }}}
    </div>
</div>

<div data-widget-area="sidebar" class="col-lg-3 col-sm-12 {{{ if !widgets.sidebar.length }}}hidden{{{ end }}}">
    {{{ each widgets.sidebar }}}
    {{widgets.sidebar.html}}
    {{{ end }}}
</div>
