/* Thành phần tiêu đề dùng lại giữa các trang, giúp thống nhất phần giới thiệu nội dung. */
import React from'react';export default function PageHeader({title,description,action}){return <div className="page-header d-flex flex-wrap justify-content-between align-items-end gap-3"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>}
