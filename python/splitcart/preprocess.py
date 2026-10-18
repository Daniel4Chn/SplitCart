"""IMG-04: bounded rotation only for consistent near-horizontal line evidence."""
import cv2
import numpy as np

def deskew(gray):
    h,w=gray.shape
    edges=cv2.Canny(gray,50,150)
    lines=cv2.HoughLinesP(edges,1,np.pi/1800,threshold=60,minLineLength=max(40,w//8),maxLineGap=12)
    angles=[]
    if lines is not None:
        for x1,y1,x2,y2 in lines[:,0]:
            if x2==x1:continue
            angle=float(np.degrees(np.arctan2(y2-y1,x2-x1)))
            if abs(angle)<=5:angles.append(angle)
    identity=np.eye(3)
    if len(angles)<5:return gray,identity,'SKEW_UNCERTAIN'
    angle=float(np.median(angles));deviation=float(np.median(np.abs(np.array(angles)-angle)))
    if deviation>0.6 or not 0.5<=abs(angle)<=5:return gray,identity,'SKEW_NOT_CORRECTED'
    matrix=cv2.getRotationMatrix2D((w/2,h/2),angle,1)
    transformed=cv2.warpAffine(gray,matrix,(w,h),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT,borderValue=255)
    full=np.vstack([matrix,[0,0,1]])
    return transformed,np.linalg.inv(full),'BOUNDED_DESKEW_APPLIED'

def display_box(box,inverse,width,height):
    x,y,w,h=box
    points=np.array([[x,y,1],[x+w,y,1],[x,y+h,1],[x+w,y+h,1]])@inverse.T
    left=max(0,min(width,int(np.floor(points[:,0].min()))));top=max(0,min(height,int(np.floor(points[:,1].min()))))
    right=max(left,min(width,int(np.ceil(points[:,0].max()))));bottom=max(top,min(height,int(np.ceil(points[:,1].max()))))
    return [left,top,right-left,bottom-top]
