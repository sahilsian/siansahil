-- Prints are their own documents ('print'), each linked to one painting (product).
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE documents
    ADD CONSTRAINT documents_doc_type_check
    CHECK (doc_type IN ('site', 'page', 'product', 'collection', 'form', 'print'));
